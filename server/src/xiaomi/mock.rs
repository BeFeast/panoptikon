//! In-process mock of the MiWiFi HTTP API for tests.
//!
//! Serves the login flow and a few authenticated endpoints on a random
//! loopback port and counts logins, so tests can assert how often a caller
//! really authenticates against the router.

use axum::{
    body::Bytes,
    http::{Method, Uri},
    response::{Html, IntoResponse, Response},
    Json, Router,
};
use serde_json::json;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct MockState {
    /// Successful logins (tokens issued).
    logins: AtomicUsize,
    /// All POSTs to the login endpoint, successful or not.
    login_attempts: AtomicUsize,
    /// Calls to authenticated endpoints, any token.
    authed_calls: AtomicUsize,
    reject_logins: AtomicBool,
    valid_token: Mutex<Option<String>>,
}

pub(crate) struct MockMiwifi {
    /// `host:port` to use as the router IP setting.
    pub addr: String,
    state: Arc<MockState>,
}

impl MockMiwifi {
    pub async fn start() -> Self {
        let state = Arc::new(MockState::default());
        let handler_state = state.clone();
        let app = Router::new().fallback(move |method: Method, uri: Uri, body: Bytes| {
            let state = handler_state.clone();
            async move { handle(&state, method, uri, body) }
        });
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind mock MiWiFi");
        let addr = listener.local_addr().expect("mock addr").to_string();
        tokio::spawn(async move {
            axum::serve(listener, app).await.ok();
        });
        Self { addr, state }
    }

    pub fn logins(&self) -> usize {
        self.state.logins.load(Ordering::SeqCst)
    }

    pub fn login_attempts(&self) -> usize {
        self.state.login_attempts.load(Ordering::SeqCst)
    }

    pub fn authed_calls(&self) -> usize {
        self.state.authed_calls.load(Ordering::SeqCst)
    }

    /// Forget the issued token, as a router does after a reboot or session purge.
    pub fn revoke_token(&self) {
        *self.state.valid_token.lock().unwrap() = None;
    }

    /// Make every login fail (wrong password).
    pub fn reject_logins(&self) {
        self.state.reject_logins.store(true, Ordering::SeqCst);
    }
}

fn handle(state: &MockState, method: Method, uri: Uri, _body: Bytes) -> Response {
    let path = uri.path();

    if path == "/cgi-bin/luci/web/home" {
        return Html(
            r#"<script>var key = "a2ffa5c9be07488bbb04a3a47d3c5f6a";
               var deviceId = "AA:BB:CC:DD:EE:FF";</script>"#,
        )
        .into_response();
    }

    if path == "/cgi-bin/luci/api/xqsystem/login" && method == Method::POST {
        state.login_attempts.fetch_add(1, Ordering::SeqCst);
        if state.reject_logins.load(Ordering::SeqCst) {
            return Json(json!({"code": 401, "msg": "not auth"})).into_response();
        }
        let n = state.logins.fetch_add(1, Ordering::SeqCst) + 1;
        let token = format!("tok{n}");
        *state.valid_token.lock().unwrap() = Some(token.clone());
        return Json(json!({"code": 0, "token": token})).into_response();
    }

    if let Some(rest) = path.strip_prefix("/cgi-bin/luci/;stok=") {
        state.authed_calls.fetch_add(1, Ordering::SeqCst);
        let (token, endpoint) = rest.split_once("/api/").unwrap_or((rest, ""));
        let valid = state.valid_token.lock().unwrap().as_deref() == Some(token);
        if !valid {
            return Json(json!({"code": 401, "msg": "Invalid token"})).into_response();
        }
        return match endpoint {
            "misystem/devicelist" => Json(json!({
                "code": 0,
                "list": [
                    {"mac": "AA:BB:CC:00:00:01", "name": "Kitchen-Tablet", "online": 1, "ip": [{"ip": "10.0.0.21"}]},
                    {"mac": "AA:BB:CC:00:00:02", "name": "Hall-TV", "online": 1, "ip": [{"ip": "10.0.0.22"}]}
                ]
            }))
            .into_response(),
            // Any other endpoint answers with a non-auth error code.
            _ => Json(json!({"code": 1523, "msg": "unsupported"})).into_response(),
        };
    }

    (axum::http::StatusCode::NOT_FOUND, "not found").into_response()
}
