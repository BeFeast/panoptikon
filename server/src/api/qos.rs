//! QoS / Traffic Shaping API endpoints.
//!
//! Provides queue management for MikroTik simple queues / queue trees.
//! All endpoints proxy to the respective router APIs.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};

use super::AppState;
use crate::mikrotik::client::MikrotikClient;
use crate::mikrotik::types::SimpleQueueWriteRequest;

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

fn is_true(val: &Option<String>) -> bool {
    val.as_deref() == Some("true")
}

// ── Response types ──────────────────────────────────────────

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
    pub mikrotik_available: bool,
    pub mikrotik_simple_queue_count: usize,
    pub mikrotik_queue_tree_count: usize,
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
    let mikrotik_available = mikrotik_client(&state).await.is_some();

    let mut mikrotik_simple_queue_count = 0;
    let mut mikrotik_queue_tree_count = 0;

    if mikrotik_available {
        if let Some(client) = mikrotik_client(&state).await {
            mikrotik_simple_queue_count =
                client.simple_queues().await.map(|q| q.len()).unwrap_or(0);
            mikrotik_queue_tree_count = client.queue_tree().await.map(|q| q.len()).unwrap_or(0);
        }
    }

    Ok(Json(QosSummaryResponse {
        mikrotik_available,
        mikrotik_simple_queue_count,
        mikrotik_queue_tree_count,
    }))
}
