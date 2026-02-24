use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use tracing::{error, info, warn};

use super::audit;
use super::vyos::get_vyos_client_or_503;
use super::AppState;

// ─── DTOs ──────────────────────────────────────────────────

/// A dynamic DNS entry as returned to the frontend.
#[derive(Debug, Serialize)]
pub struct DynamicDnsEntry {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub hostname: String,
    pub username: String,
    pub interface: String,
    pub ip_source: String,
    pub enabled: bool,
    pub router_type: String,
    pub last_ip: Option<String>,
    pub last_status: Option<String>,
    pub last_update_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Request body for creating/updating a DDNS entry.
#[derive(Debug, Deserialize)]
pub struct DynamicDnsRequest {
    pub name: String,
    pub provider: String,
    pub hostname: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub interface: String,
    #[serde(default = "default_ip_source")]
    pub ip_source: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_router_type")]
    pub router_type: String,
}

fn default_true() -> bool {
    true
}

fn default_ip_source() -> String {
    "interface".to_string()
}

fn default_router_type() -> String {
    "vyos".to_string()
}

/// Response for write operations.
#[derive(Debug, Serialize)]
pub struct DynamicDnsWriteResponse {
    pub success: bool,
    pub message: String,
}

// ─── Handlers: CRUD ─────────────────────────────────────────

/// GET /api/v1/dynamic-dns — list all DDNS entries.
pub async fn list(State(state): State<AppState>) -> Result<Json<Vec<DynamicDnsEntry>>, StatusCode> {
    let rows = sqlx::query(
        "SELECT id, name, provider, hostname, username, interface, ip_source, \
         enabled, router_type, last_ip, last_status, last_update_at, last_error, \
         created_at, updated_at \
         FROM dynamic_dns ORDER BY name",
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to list dynamic DNS entries: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let entries: Vec<DynamicDnsEntry> = rows
        .into_iter()
        .map(|r| DynamicDnsEntry {
            id: r.get("id"),
            name: r.get("name"),
            provider: r.get("provider"),
            hostname: r.get("hostname"),
            username: r.get("username"),
            interface: r.get("interface"),
            ip_source: r.get("ip_source"),
            enabled: r.get::<i32, _>("enabled") != 0,
            router_type: r.get("router_type"),
            last_ip: r.get("last_ip"),
            last_status: r.get("last_status"),
            last_update_at: r.get("last_update_at"),
            last_error: r.get("last_error"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        })
        .collect();

    Ok(Json(entries))
}

/// POST /api/v1/dynamic-dns — create a new DDNS entry.
pub async fn create(
    State(state): State<AppState>,
    Json(body): Json<DynamicDnsRequest>,
) -> Result<(StatusCode, Json<DynamicDnsEntry>), StatusCode> {
    if body.name.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if body.hostname.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }
    if body.provider.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO dynamic_dns \
         (id, name, provider, hostname, username, password, interface, ip_source, enabled, router_type) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(body.name.trim())
    .bind(body.provider.trim())
    .bind(body.hostname.trim())
    .bind(&body.username)
    .bind(&body.password)
    .bind(&body.interface)
    .bind(&body.ip_source)
    .bind(body.enabled as i32)
    .bind(&body.router_type)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to create dynamic DNS entry: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Configure on VyOS if router_type is vyos
    if body.router_type == "vyos" && body.enabled {
        if let Err(e) = configure_vyos_ddns(&state, &body).await {
            warn!("Failed to configure DDNS on VyOS (entry saved locally): {e}");
            // Update status in DB
            let _ = sqlx::query(
                "UPDATE dynamic_dns SET last_error = ?, last_status = 'config_error', updated_at = datetime('now') WHERE id = ?",
            )
            .bind(format!("{e}"))
            .bind(&id)
            .execute(&state.db)
            .await;
        }
    }

    audit::log_success(
        &state.db,
        "ddns_create",
        &format!(
            "Created dynamic DNS entry '{}' ({} -> {})",
            body.name, body.provider, body.hostname
        ),
        &[],
    )
    .await;

    let entry = fetch_entry_by_id(&state, &id).await?;
    Ok((StatusCode::CREATED, Json(entry)))
}

/// PUT /api/v1/dynamic-dns/:id — update a DDNS entry.
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<DynamicDnsRequest>,
) -> Result<Json<DynamicDnsEntry>, StatusCode> {
    if body.name.trim().is_empty()
        || body.hostname.trim().is_empty()
        || body.provider.trim().is_empty()
    {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Fetch old entry to know old name for VyOS cleanup
    let old = fetch_entry_by_id(&state, &id).await?;

    let affected = sqlx::query(
        "UPDATE dynamic_dns \
         SET name = ?, provider = ?, hostname = ?, username = ?, password = ?, \
             interface = ?, ip_source = ?, enabled = ?, router_type = ?, \
             updated_at = datetime('now') \
         WHERE id = ?",
    )
    .bind(body.name.trim())
    .bind(body.provider.trim())
    .bind(body.hostname.trim())
    .bind(&body.username)
    .bind(&body.password)
    .bind(&body.interface)
    .bind(&body.ip_source)
    .bind(body.enabled as i32)
    .bind(&body.router_type)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to update dynamic DNS entry: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .rows_affected();

    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    // Re-configure VyOS if applicable
    if body.router_type == "vyos" {
        // Delete old config if name changed
        if old.name != body.name.trim() {
            let _ = delete_vyos_ddns_by_name(&state, &old.name).await;
        }
        if body.enabled {
            if let Err(e) = configure_vyos_ddns(&state, &body).await {
                warn!("Failed to configure DDNS on VyOS: {e}");
                let _ = sqlx::query(
                    "UPDATE dynamic_dns SET last_error = ?, last_status = 'config_error', updated_at = datetime('now') WHERE id = ?",
                )
                .bind(format!("{e}"))
                .bind(&id)
                .execute(&state.db)
                .await;
            }
        } else {
            let _ = delete_vyos_ddns_by_name(&state, body.name.trim()).await;
        }
    }

    audit::log_success(
        &state.db,
        "ddns_update",
        &format!("Updated dynamic DNS entry '{}'", body.name),
        &[],
    )
    .await;

    let entry = fetch_entry_by_id(&state, &id).await?;
    Ok(Json(entry))
}

/// DELETE /api/v1/dynamic-dns/:id — delete a DDNS entry.
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Fetch entry for VyOS cleanup
    let entry = fetch_entry_by_id(&state, &id).await?;

    let affected = sqlx::query("DELETE FROM dynamic_dns WHERE id = ?")
        .bind(&id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            error!("Failed to delete dynamic DNS entry: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .rows_affected();

    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    // Remove from VyOS if applicable
    if entry.router_type == "vyos" {
        if let Err(e) = delete_vyos_ddns_by_name(&state, &entry.name).await {
            warn!("Failed to remove DDNS from VyOS (DB entry deleted): {e}");
        }
    }

    audit::log_success(
        &state.db,
        "ddns_delete",
        &format!(
            "Deleted dynamic DNS entry '{}' ({})",
            entry.name, entry.hostname
        ),
        &[],
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/v1/dynamic-dns/:id/toggle — enable/disable a DDNS entry.
pub async fn toggle(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ToggleRequest>,
) -> Result<Json<DynamicDnsEntry>, StatusCode> {
    let entry = fetch_entry_by_id(&state, &id).await?;

    let affected = sqlx::query(
        "UPDATE dynamic_dns SET enabled = ?, updated_at = datetime('now') WHERE id = ?",
    )
    .bind(body.enabled as i32)
    .bind(&id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to toggle dynamic DNS entry: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .rows_affected();

    if affected == 0 {
        return Err(StatusCode::NOT_FOUND);
    }

    // Update VyOS config
    if entry.router_type == "vyos" {
        if body.enabled {
            // Re-read the full entry to get password (not returned in DTO)
            let row = sqlx::query(
                "SELECT name, provider, hostname, username, password, interface, ip_source, router_type \
                 FROM dynamic_dns WHERE id = ?",
            )
            .bind(&id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| {
                error!("Failed to fetch DDNS entry for VyOS config: {e}");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .ok_or(StatusCode::NOT_FOUND)?;

            let req = DynamicDnsRequest {
                name: row.get("name"),
                provider: row.get("provider"),
                hostname: row.get("hostname"),
                username: row.get("username"),
                password: row.get("password"),
                interface: row.get("interface"),
                ip_source: row.get("ip_source"),
                enabled: true,
                router_type: row.get("router_type"),
            };
            if let Err(e) = configure_vyos_ddns(&state, &req).await {
                warn!("Failed to enable DDNS on VyOS: {e}");
            }
        } else {
            let _ = delete_vyos_ddns_by_name(&state, &entry.name).await;
        }
    }

    let action = if body.enabled { "enabled" } else { "disabled" };
    info!("Dynamic DNS entry '{}' {action}", entry.name);

    let updated = fetch_entry_by_id(&state, &id).await?;
    Ok(Json(updated))
}

#[derive(Debug, Deserialize)]
pub struct ToggleRequest {
    pub enabled: bool,
}

/// POST /api/v1/dynamic-dns/:id/status — refresh status from router.
pub async fn status(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<DynamicDnsEntry>, StatusCode> {
    let entry = fetch_entry_by_id(&state, &id).await?;

    if entry.router_type == "vyos" {
        if let Ok(client) = get_vyos_client_or_503(&state).await {
            match client.show(&["dns", "dynamic", "status"]).await {
                Ok(val) => {
                    // Try to extract status for this entry's name
                    let status_text = val.to_string();
                    let (ip, update_status) = parse_ddns_status(&status_text, &entry.name);

                    let _ = sqlx::query(
                        "UPDATE dynamic_dns SET last_ip = COALESCE(?, last_ip), \
                         last_status = COALESCE(?, last_status), \
                         last_update_at = datetime('now'), last_error = NULL, \
                         updated_at = datetime('now') WHERE id = ?",
                    )
                    .bind(&ip)
                    .bind(&update_status)
                    .bind(&id)
                    .execute(&state.db)
                    .await;
                }
                Err(e) => {
                    warn!("Failed to get DDNS status from VyOS: {e}");
                    let _ = sqlx::query(
                        "UPDATE dynamic_dns SET last_error = ?, updated_at = datetime('now') WHERE id = ?",
                    )
                    .bind(format!("Status check failed: {e}"))
                    .bind(&id)
                    .execute(&state.db)
                    .await;
                }
            }
        }
    }

    let updated = fetch_entry_by_id(&state, &id).await?;
    Ok(Json(updated))
}

// ─── VyOS Configuration Helpers ───────────────────────────────

/// Configure a DDNS entry on VyOS.
///
/// VyOS 1.4+ uses: `service dns dynamic name <name> ...`
async fn configure_vyos_ddns(state: &AppState, body: &DynamicDnsRequest) -> Result<(), String> {
    let client = get_vyos_client_or_503(state)
        .await
        .map_err(|_| "Router not configured".to_string())?;

    let name = body.name.trim();

    // Set protocol (provider)
    client
        .configure_set(&[
            "service",
            "dns",
            "dynamic",
            "name",
            name,
            "protocol",
            body.provider.trim(),
        ])
        .await
        .map_err(|e| format!("Failed to set protocol: {e}"))?;

    // Set host-name(s)
    for host in body
        .hostname
        .split(',')
        .map(|h| h.trim())
        .filter(|h| !h.is_empty())
    {
        client
            .configure_set(&["service", "dns", "dynamic", "name", name, "host-name", host])
            .await
            .map_err(|e| format!("Failed to set host-name: {e}"))?;
    }

    // Set username if provided
    if !body.username.is_empty() {
        client
            .configure_set(&[
                "service",
                "dns",
                "dynamic",
                "name",
                name,
                "username",
                &body.username,
            ])
            .await
            .map_err(|e| format!("Failed to set username: {e}"))?;
    }

    // Set password if provided
    if !body.password.is_empty() {
        client
            .configure_set(&[
                "service",
                "dns",
                "dynamic",
                "name",
                name,
                "password",
                &body.password,
            ])
            .await
            .map_err(|e| format!("Failed to set password: {e}"))?;
    }

    // Set IP address source
    if body.ip_source == "interface" && !body.interface.is_empty() {
        client
            .configure_set(&[
                "service",
                "dns",
                "dynamic",
                "name",
                name,
                "address",
                "interface",
            ])
            .await
            .map_err(|e| format!("Failed to set address source: {e}"))?;

        client
            .configure_set(&[
                "service",
                "dns",
                "dynamic",
                "name",
                name,
                "address",
                &body.interface,
            ])
            .await
            .map_err(|e| format!("Failed to set interface: {e}"))?;
    } else if body.ip_source == "web" {
        client
            .configure_set(&["service", "dns", "dynamic", "name", name, "address", "web"])
            .await
            .map_err(|e| format!("Failed to set web address source: {e}"))?;
    }

    // Commit
    client
        .configure_commit()
        .await
        .map_err(|e| format!("Failed to commit DDNS config: {e}"))?;

    // Save
    let _ = client.config_save().await;

    info!(
        "Configured DDNS '{name}' on VyOS (provider={}, hostname={})",
        body.provider, body.hostname
    );
    Ok(())
}

/// Delete a DDNS entry from VyOS by name.
async fn delete_vyos_ddns_by_name(state: &AppState, name: &str) -> Result<(), String> {
    let client = get_vyos_client_or_503(state)
        .await
        .map_err(|_| "Router not configured".to_string())?;

    client
        .configure_delete(&["service", "dns", "dynamic", "name", name])
        .await
        .map_err(|e| format!("Failed to delete DDNS config: {e}"))?;

    client
        .configure_commit()
        .await
        .map_err(|e| format!("Failed to commit DDNS deletion: {e}"))?;

    let _ = client.config_save().await;

    info!("Deleted DDNS '{name}' from VyOS");
    Ok(())
}

/// Parse DDNS status output from VyOS to extract IP and status for a given entry name.
fn parse_ddns_status(status_text: &str, _name: &str) -> (Option<String>, Option<String>) {
    // VyOS dynamic DNS status output varies by version.
    // For a simple approach, try to find IP addresses and "good"/"nochg" status strings.
    let ip = extract_ip_from_text(status_text);
    let status = if status_text.contains("good") || status_text.contains("nochg") {
        Some("success".to_string())
    } else if status_text.contains("abuse") || status_text.contains("error") {
        Some("error".to_string())
    } else {
        Some("unknown".to_string())
    };
    (ip, status)
}

/// Extract first IP address from text.
fn extract_ip_from_text(text: &str) -> Option<String> {
    for word in text.split_whitespace() {
        let clean = word.trim_matches(|c: char| !c.is_ascii_digit() && c != '.');
        if clean.parse::<std::net::Ipv4Addr>().is_ok() {
            return Some(clean.to_string());
        }
    }
    None
}

// ─── Internal helpers ─────────────────────────────────────────

async fn fetch_entry_by_id(state: &AppState, id: &str) -> Result<DynamicDnsEntry, StatusCode> {
    let row = sqlx::query(
        "SELECT id, name, provider, hostname, username, interface, ip_source, \
         enabled, router_type, last_ip, last_status, last_update_at, last_error, \
         created_at, updated_at \
         FROM dynamic_dns WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        error!("Failed to fetch dynamic DNS entry: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(DynamicDnsEntry {
        id: row.get("id"),
        name: row.get("name"),
        provider: row.get("provider"),
        hostname: row.get("hostname"),
        username: row.get("username"),
        interface: row.get("interface"),
        ip_source: row.get("ip_source"),
        enabled: row.get::<i32, _>("enabled") != 0,
        router_type: row.get("router_type"),
        last_ip: row.get("last_ip"),
        last_status: row.get("last_status"),
        last_update_at: row.get("last_update_at"),
        last_error: row.get("last_error"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}
