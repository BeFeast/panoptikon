use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};
use tracing::info;

/// Unique identifier for a connected client (agent or UI browser).
pub type ClientId = String;

/// Message broadcast to UI clients when state changes.
#[derive(Debug, Clone)]
pub struct BroadcastMessage {
    pub event: String,
    pub payload: serde_json::Value,
}

/// The WebSocket hub manages connections from both agents and UI browsers.
///
/// - Agent connections are tracked individually (for sending commands).
/// - UI connections receive broadcast updates (device state changes, new alerts, etc.).
pub struct WsHub {
    /// Broadcast channel for UI clients.
    ui_tx: broadcast::Sender<BroadcastMessage>,

    /// Connected agents, keyed by agent ID.
    agents: RwLock<HashMap<ClientId, AgentConnection>>,
}

/// Represents a connected agent's communication channel.
struct AgentConnection {
    /// Channel to send commands to this agent.
    _cmd_tx: tokio::sync::mpsc::Sender<String>,
}

impl WsHub {
    /// Create a new WebSocket hub.
    pub fn new() -> Arc<Self> {
        let (ui_tx, _) = broadcast::channel(256);
        Arc::new(Self {
            ui_tx,
            agents: RwLock::new(HashMap::new()),
        })
    }

    /// Subscribe to UI broadcast updates.
    pub fn subscribe_ui(&self) -> broadcast::Receiver<BroadcastMessage> {
        self.ui_tx.subscribe()
    }

    /// Broadcast an event to all connected UI clients.
    pub fn broadcast(&self, event: &str, payload: serde_json::Value) {
        let msg = BroadcastMessage {
            event: event.to_string(),
            payload,
        };
        // Ignore error (no receivers connected).
        let _ = self.ui_tx.send(msg);
    }

    /// Register a new agent connection.
    pub async fn register_agent(&self, agent_id: &str) -> tokio::sync::mpsc::Receiver<String> {
        let (cmd_tx, cmd_rx) = tokio::sync::mpsc::channel(32);
        let conn = AgentConnection { _cmd_tx: cmd_tx };

        self.agents
            .write()
            .await
            .insert(agent_id.to_string(), conn);
        info!(agent_id = %agent_id, "Agent registered in hub");

        cmd_rx
    }

    /// Remove an agent connection.
    pub async fn unregister_agent(&self, agent_id: &str) {
        self.agents.write().await.remove(agent_id);
        info!(agent_id = %agent_id, "Agent unregistered from hub");
    }

    /// Get the number of connected agents.
    pub async fn agent_count(&self) -> usize {
        self.agents.read().await.len()
    }
}
