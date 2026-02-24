//! QoS / Traffic Shaping API endpoints.
//!
//! Provides queue management for VyOS traffic policies and MikroTik simple
//! queues / queue trees. All endpoints proxy to the respective router APIs.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use super::AppState;
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::SimpleQueueWriteRequest;
use crate::vyos::client::VyosClient;

// ── Helpers ─────────────────────────────────────────────────

async fn get_setting(state: &AppState, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = ?")
        .bind(key)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .filter(|v| !v.is_empty())
}

async fn mikrotik_client(state: &AppState) -> Option<MikrotikClient> {
    let enabled = get_setting(state, "mikrotik_enabled")
        .await
        .map(|v| v == "1" || v == "true")
        .unwrap_or(false);
    if !enabled {
        return None;
    }

    let url = get_setting(state, "mikrotik_url").await?;
    let user = get_setting(state, "mikrotik_user")
        .await
        .unwrap_or_else(|| "admin".to_string());
    let password = get_setting(state, "mikrotik_password")
        .await
        .unwrap_or_default();

    Some(MikrotikClient::with_http(
        &url,
        &user,
        &password,
        state.mikrotik_http.clone(),
    ))
}

async fn vyos_client(state: &AppState) -> Option<VyosClient> {
    let url = get_setting(state, "vyos_url").await?;
    let key = get_setting(state, "vyos_api_key").await?;
    Some(VyosClient::with_http(&url, &key, state.vyos_http.clone()))
}

fn is_true(val: &Option<String>) -> bool {
    val.as_deref() == Some("true")
}

// ── Response types ──────────────────────────────────────────

// --- VyOS Traffic Policies ---

#[derive(Debug, Serialize, Deserialize)]
pub struct VyosTrafficPolicyClass {
    pub id: String,
    pub bandwidth: Option<String>,
    pub ceiling: Option<String>,
    pub priority: Option<String>,
    pub queue_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VyosTrafficPolicy {
    pub name: String,
    pub policy_type: String,
    pub bandwidth: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_bandwidth: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_ceiling: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub classes: Vec<VyosTrafficPolicyClass>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VyosTrafficPoliciesResponse {
    pub policies: Vec<VyosTrafficPolicy>,
}

#[derive(Debug, Deserialize)]
pub struct CreateVyosTrafficPolicyRequest {
    pub name: String,
    pub policy_type: String,
    pub bandwidth: String,
    pub default_bandwidth: Option<String>,
    pub default_ceiling: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub classes: Vec<CreateVyosTrafficPolicyClassRequest>,
}

#[derive(Debug, Deserialize)]
pub struct CreateVyosTrafficPolicyClassRequest {
    pub id: String,
    pub bandwidth: Option<String>,
    pub ceiling: Option<String>,
    pub priority: Option<String>,
    pub queue_type: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct VyosQosWriteResponse {
    pub success: bool,
    pub message: String,
}

// --- MikroTik Simple Queues ---

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikSimpleQueueResponse {
    pub id: Option<String>,
    pub name: String,
    pub target: String,
    pub max_limit: Option<String>,
    pub burst_limit: Option<String>,
    pub burst_threshold: Option<String>,
    pub burst_time: Option<String>,
    pub priority: Option<String>,
    pub comment: Option<String>,
    pub disabled: bool,
    pub parent: Option<String>,
    pub bytes: Option<String>,
    pub packets: Option<String>,
    pub rate: Option<String>,
    pub packet_rate: Option<String>,
    pub dynamic: bool,
}

#[derive(Debug, Deserialize)]
pub struct MikrotikSimpleQueueUpsertRequest {
    pub name: String,
    pub target: String,
    pub max_limit: String,
    pub burst_limit: Option<String>,
    pub burst_threshold: Option<String>,
    pub burst_time: Option<String>,
    pub priority: Option<String>,
    pub comment: Option<String>,
    pub disabled: Option<bool>,
    pub parent: Option<String>,
}

// --- MikroTik Queue Tree ---

#[derive(Debug, Serialize, Deserialize)]
pub struct MikrotikQueueTreeResponse {
    pub id: Option<String>,
    pub name: String,
    pub parent: Option<String>,
    pub packet_mark: Option<String>,
    pub priority: Option<String>,
    pub max_limit: Option<String>,
    pub burst_limit: Option<String>,
    pub burst_threshold: Option<String>,
    pub burst_time: Option<String>,
    pub comment: Option<String>,
    pub disabled: bool,
    pub bytes: Option<String>,
    pub packets: Option<String>,
    pub rate: Option<String>,
    pub packet_rate: Option<String>,
    pub dynamic: bool,
}

// --- Unified QoS Summary ---

#[derive(Debug, Serialize)]
pub struct QosSummaryResponse {
    pub vyos_available: bool,
    pub mikrotik_available: bool,
    pub vyos_policy_count: usize,
    pub mikrotik_simple_queue_count: usize,
    pub mikrotik_queue_tree_count: usize,
}

// ── VyOS Endpoints ──────────────────────────────────────────

/// GET /api/v1/qos/vyos/policies
pub async fn vyos_traffic_policies(
    State(state): State<AppState>,
) -> Result<Json<VyosTrafficPoliciesResponse>, StatusCode> {
    let client = vyos_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.vyos_cache.get("qos-traffic-policies") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let config = client.retrieve(&["traffic-policy"]).await.map_err(|e| {
        tracing::warn!("VyOS traffic-policy retrieve failed: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let policies = parse_vyos_traffic_policies(&config);

    let resp = VyosTrafficPoliciesResponse { policies };
    if let Ok(val) = serde_json::to_value(&resp) {
        state.vyos_cache.set("qos-traffic-policies".into(), val);
    }
    Ok(Json(resp))
}

/// POST /api/v1/qos/vyos/policies
pub async fn create_vyos_traffic_policy(
    State(state): State<AppState>,
    Json(body): Json<CreateVyosTrafficPolicyRequest>,
) -> Result<Json<VyosQosWriteResponse>, StatusCode> {
    let client = vyos_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if body.name.trim().is_empty() || body.bandwidth.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let policy_type = &body.policy_type;
    let name = body.name.trim();

    // Set the main bandwidth
    client
        .configure_set(&[
            "traffic-policy",
            policy_type,
            name,
            "bandwidth",
            &body.bandwidth,
        ])
        .await
        .map_err(|e| {
            tracing::error!("VyOS QoS create error: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    // Set optional description
    if let Some(desc) = &body.description {
        let _ = client
            .configure_set(&["traffic-policy", policy_type, name, "description", desc])
            .await;
    }

    // Set default bandwidth/ceiling for shaper policies
    if let Some(db) = &body.default_bandwidth {
        let _ = client
            .configure_set(&[
                "traffic-policy",
                policy_type,
                name,
                "default",
                "bandwidth",
                db,
            ])
            .await;
    }
    if let Some(dc) = &body.default_ceiling {
        let _ = client
            .configure_set(&[
                "traffic-policy",
                policy_type,
                name,
                "default",
                "ceiling",
                dc,
            ])
            .await;
    }

    // Create classes
    for cls in &body.classes {
        let class_id = cls.id.trim();
        if class_id.is_empty() {
            continue;
        }
        if let Some(bw) = &cls.bandwidth {
            let _ = client
                .configure_set(&[
                    "traffic-policy",
                    policy_type,
                    name,
                    "class",
                    class_id,
                    "bandwidth",
                    bw,
                ])
                .await;
        }
        if let Some(ceil) = &cls.ceiling {
            let _ = client
                .configure_set(&[
                    "traffic-policy",
                    policy_type,
                    name,
                    "class",
                    class_id,
                    "ceiling",
                    ceil,
                ])
                .await;
        }
        if let Some(pri) = &cls.priority {
            let _ = client
                .configure_set(&[
                    "traffic-policy",
                    policy_type,
                    name,
                    "class",
                    class_id,
                    "priority",
                    pri,
                ])
                .await;
        }
        if let Some(qt) = &cls.queue_type {
            let _ = client
                .configure_set(&[
                    "traffic-policy",
                    policy_type,
                    name,
                    "class",
                    class_id,
                    "queue-type",
                    qt,
                ])
                .await;
        }
        if let Some(desc) = &cls.description {
            let _ = client
                .configure_set(&[
                    "traffic-policy",
                    policy_type,
                    name,
                    "class",
                    class_id,
                    "description",
                    desc,
                ])
                .await;
        }
    }

    // Commit
    client.configure_commit().await.map_err(|e| {
        tracing::error!("VyOS QoS commit error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(Json(VyosQosWriteResponse {
        success: true,
        message: format!("Traffic policy '{name}' created"),
    }))
}

/// DELETE /api/v1/qos/vyos/policies/:policy_type/:name
pub async fn delete_vyos_traffic_policy(
    Path((policy_type, name)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<Json<VyosQosWriteResponse>, StatusCode> {
    let client = vyos_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    client
        .configure_delete(&["traffic-policy", &policy_type, &name])
        .await
        .map_err(|e| {
            tracing::error!("VyOS QoS delete error: {e}");
            StatusCode::BAD_GATEWAY
        })?;

    client.configure_commit().await.map_err(|e| {
        tracing::error!("VyOS QoS commit error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(Json(VyosQosWriteResponse {
        success: true,
        message: format!("Traffic policy '{name}' deleted"),
    }))
}

// ── MikroTik Endpoints ──────────────────────────────────────

/// GET /api/v1/qos/mikrotik/simple-queues
pub async fn mikrotik_simple_queues(
    State(state): State<AppState>,
) -> Result<Json<Vec<MikrotikSimpleQueueResponse>>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.mikrotik_cache.get("simple-queues") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let queues = client.simple_queues().await.map_err(|e| {
        tracing::error!("MikroTik simple queues error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let result: Vec<MikrotikSimpleQueueResponse> = queues
        .into_iter()
        .map(|q| MikrotikSimpleQueueResponse {
            id: q.id,
            name: q.name.unwrap_or_default(),
            target: q.target.unwrap_or_default(),
            max_limit: q.max_limit,
            burst_limit: q.burst_limit,
            burst_threshold: q.burst_threshold,
            burst_time: q.burst_time,
            priority: q.priority,
            comment: q.comment,
            disabled: is_true(&q.disabled),
            parent: q.parent,
            bytes: q.bytes,
            packets: q.packets,
            rate: q.rate,
            packet_rate: q.packet_rate,
            dynamic: is_true(&q.dynamic),
        })
        .collect();

    if let Ok(val) = serde_json::to_value(&result) {
        state.mikrotik_cache.set("simple-queues".into(), val);
    }
    Ok(Json(result))
}

/// POST /api/v1/qos/mikrotik/simple-queues
pub async fn create_mikrotik_simple_queue(
    State(state): State<AppState>,
    Json(body): Json<MikrotikSimpleQueueUpsertRequest>,
) -> Result<StatusCode, StatusCode> {
    if body.name.trim().is_empty() || body.target.trim().is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = SimpleQueueWriteRequest {
        name: body.name.trim().to_string(),
        target: body.target.trim().to_string(),
        max_limit: body.max_limit.trim().to_string(),
        burst_limit: body.burst_limit.map(|s| s.trim().to_string()),
        burst_threshold: body.burst_threshold.map(|s| s.trim().to_string()),
        burst_time: body.burst_time.map(|s| s.trim().to_string()),
        priority: body.priority.map(|s| s.trim().to_string()),
        comment: body.comment.map(|s| s.trim().to_string()),
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.to_string()),
        parent: body.parent.map(|s| s.trim().to_string()),
    };

    client.create_simple_queue(&req).await.map_err(|e| {
        tracing::error!("MikroTik simple queue create error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// PUT /api/v1/qos/mikrotik/simple-queues/:id
pub async fn update_mikrotik_simple_queue(
    Path(id): Path<String>,
    State(state): State<AppState>,
    Json(body): Json<MikrotikSimpleQueueUpsertRequest>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    let req = SimpleQueueWriteRequest {
        name: body.name.trim().to_string(),
        target: body.target.trim().to_string(),
        max_limit: body.max_limit.trim().to_string(),
        burst_limit: body.burst_limit.map(|s| s.trim().to_string()),
        burst_threshold: body.burst_threshold.map(|s| s.trim().to_string()),
        burst_time: body.burst_time.map(|s| s.trim().to_string()),
        priority: body.priority.map(|s| s.trim().to_string()),
        comment: body.comment.map(|s| s.trim().to_string()),
        disabled: body
            .disabled
            .map(|d| if d { "true" } else { "false" }.to_string()),
        parent: body.parent.map(|s| s.trim().to_string()),
    };

    client.update_simple_queue(id, &req).await.map_err(|e| {
        tracing::error!("MikroTik simple queue update error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/v1/qos/mikrotik/simple-queues/:id
pub async fn delete_mikrotik_simple_queue(
    Path(id): Path<String>,
    State(state): State<AppState>,
) -> Result<StatusCode, StatusCode> {
    let id = id.trim();
    if id.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    client.delete_simple_queue(id).await.map_err(|e| {
        tracing::error!("MikroTik simple queue delete error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/v1/qos/mikrotik/queue-tree
pub async fn mikrotik_queue_tree(
    State(state): State<AppState>,
) -> Result<Json<Vec<MikrotikQueueTreeResponse>>, StatusCode> {
    let client = mikrotik_client(&state)
        .await
        .ok_or(StatusCode::SERVICE_UNAVAILABLE)?;

    if let Some(cached) = state.mikrotik_cache.get("queue-tree") {
        if let Ok(resp) = serde_json::from_value(cached) {
            return Ok(Json(resp));
        }
    }

    let tree = client.queue_tree().await.map_err(|e| {
        tracing::error!("MikroTik queue tree error: {e}");
        StatusCode::BAD_GATEWAY
    })?;

    let result: Vec<MikrotikQueueTreeResponse> = tree
        .into_iter()
        .map(|q| MikrotikQueueTreeResponse {
            id: q.id,
            name: q.name.unwrap_or_default(),
            parent: q.parent,
            packet_mark: q.packet_mark,
            priority: q.priority,
            max_limit: q.max_limit,
            burst_limit: q.burst_limit,
            burst_threshold: q.burst_threshold,
            burst_time: q.burst_time,
            comment: q.comment,
            disabled: is_true(&q.disabled),
            bytes: q.bytes,
            packets: q.packets,
            rate: q.rate,
            packet_rate: q.packet_rate,
            dynamic: is_true(&q.dynamic),
        })
        .collect();

    if let Ok(val) = serde_json::to_value(&result) {
        state.mikrotik_cache.set("queue-tree".into(), val);
    }
    Ok(Json(result))
}

// ── Summary Endpoint ────────────────────────────────────────

/// GET /api/v1/qos/summary
pub async fn qos_summary(
    State(state): State<AppState>,
) -> Result<Json<QosSummaryResponse>, StatusCode> {
    let vyos_available = vyos_client(&state).await.is_some();
    let mikrotik_available = mikrotik_client(&state).await.is_some();

    let mut vyos_policy_count = 0;
    let mut mikrotik_simple_queue_count = 0;
    let mut mikrotik_queue_tree_count = 0;

    if vyos_available {
        if let Some(client) = vyos_client(&state).await {
            if let Ok(config) = client.retrieve(&["traffic-policy"]).await {
                vyos_policy_count = parse_vyos_traffic_policies(&config).len();
            }
        }
    }

    if mikrotik_available {
        if let Some(client) = mikrotik_client(&state).await {
            mikrotik_simple_queue_count =
                client.simple_queues().await.map(|q| q.len()).unwrap_or(0);
            mikrotik_queue_tree_count = client.queue_tree().await.map(|q| q.len()).unwrap_or(0);
        }
    }

    Ok(Json(QosSummaryResponse {
        vyos_available,
        mikrotik_available,
        vyos_policy_count,
        mikrotik_simple_queue_count,
        mikrotik_queue_tree_count,
    }))
}

// ── VyOS Config Parsing ─────────────────────────────────────

fn parse_vyos_traffic_policies(config: &serde_json::Value) -> Vec<VyosTrafficPolicy> {
    let mut policies = Vec::new();

    let obj = match config.as_object() {
        Some(o) => o,
        None => return policies,
    };

    // VyOS traffic-policy config is structured as:
    // { "shaper": { "policy-name": { ... } }, "limiter": { ... }, ... }
    for (policy_type, type_obj) in obj {
        let type_map = match type_obj.as_object() {
            Some(m) => m,
            None => continue,
        };

        for (name, policy_config) in type_map {
            let bandwidth = policy_config
                .get("bandwidth")
                .and_then(|v| v.as_str())
                .map(String::from);
            let description = policy_config
                .get("description")
                .and_then(|v| v.as_str())
                .map(String::from);

            let default_bandwidth = policy_config
                .get("default")
                .and_then(|d| d.get("bandwidth"))
                .and_then(|v| v.as_str())
                .map(String::from);
            let default_ceiling = policy_config
                .get("default")
                .and_then(|d| d.get("ceiling"))
                .and_then(|v| v.as_str())
                .map(String::from);

            let mut classes = Vec::new();
            if let Some(class_map) = policy_config.get("class").and_then(|v| v.as_object()) {
                for (class_id, class_config) in class_map {
                    classes.push(VyosTrafficPolicyClass {
                        id: class_id.clone(),
                        bandwidth: class_config
                            .get("bandwidth")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        ceiling: class_config
                            .get("ceiling")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        priority: class_config
                            .get("priority")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        queue_type: class_config
                            .get("queue-type")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        description: class_config
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                    });
                }
            }

            policies.push(VyosTrafficPolicy {
                name: name.clone(),
                policy_type: policy_type.clone(),
                bandwidth,
                default_bandwidth,
                default_ceiling,
                description,
                classes,
            });
        }
    }

    policies
}
