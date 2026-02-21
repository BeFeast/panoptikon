use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

/// Structured JSON error body returned by all API error responses.
#[derive(Serialize)]
pub struct ApiErrorBody {
    pub code: &'static str,
    pub message: String,
}

/// Unified application error type.
///
/// Implements [`IntoResponse`] so handlers can return `Result<T, AppError>`
/// and axum will convert errors into structured JSON responses with the
/// appropriate HTTP status code.
pub enum AppError {
    /// Database query failed.
    Database(sqlx::Error),
    /// Resource not found (404).
    NotFound,
    /// Authentication required (401).
    Unauthorized,
    /// Input validation failed (400).
    Validation(String),
    /// Internal server error (500).
    Internal(String),
    /// Upstream service returned an error (502).
    BadGateway(String),
    /// Required service is not available (503).
    ServiceUnavailable(String),
    /// Rate limit exceeded (429).
    TooManyRequests(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            AppError::NotFound => (
                StatusCode::NOT_FOUND,
                "not_found",
                "Resource not found".to_string(),
            ),
            AppError::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                "Authentication required".to_string(),
            ),
            AppError::Validation(msg) => (StatusCode::BAD_REQUEST, "validation_error", msg),
            AppError::Database(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "database_error",
                e.to_string(),
            ),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, "internal_error", msg),
            AppError::BadGateway(msg) => (StatusCode::BAD_GATEWAY, "bad_gateway", msg),
            AppError::ServiceUnavailable(msg) => {
                (StatusCode::SERVICE_UNAVAILABLE, "service_unavailable", msg)
            }
            AppError::TooManyRequests(msg) => {
                (StatusCode::TOO_MANY_REQUESTS, "too_many_requests", msg)
            }
        };
        (status, Json(ApiErrorBody { code, message })).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match e {
            sqlx::Error::RowNotFound => AppError::NotFound,
            other => AppError::Database(other),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::response::IntoResponse;

    #[tokio::test]
    async fn test_app_error_not_found_response() {
        let response = AppError::NotFound.into_response();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let body = axum::body::to_bytes(response.into_body(), 1_000_000)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["code"], "not_found");
        assert_eq!(json["message"], "Resource not found");
    }

    #[tokio::test]
    async fn test_app_error_unauthorized_response() {
        let response = AppError::Unauthorized.into_response();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let body = axum::body::to_bytes(response.into_body(), 1_000_000)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["code"], "unauthorized");
    }

    #[tokio::test]
    async fn test_app_error_validation_response() {
        let response = AppError::Validation("email is required".to_string()).into_response();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let body = axum::body::to_bytes(response.into_body(), 1_000_000)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["code"], "validation_error");
        assert_eq!(json["message"], "email is required");
    }

    #[tokio::test]
    async fn test_app_error_internal_response() {
        let response = AppError::Internal("something broke".to_string()).into_response();
        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);

        let body = axum::body::to_bytes(response.into_body(), 1_000_000)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(json["code"], "internal_error");
    }

    #[tokio::test]
    async fn test_app_error_bad_gateway_response() {
        let response = AppError::BadGateway("upstream timeout".to_string()).into_response();
        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
    }

    #[tokio::test]
    async fn test_app_error_service_unavailable_response() {
        let response =
            AppError::ServiceUnavailable("VyOS not configured".to_string()).into_response();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn test_app_error_too_many_requests_response() {
        let response = AppError::TooManyRequests("try again later".to_string()).into_response();
        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    }
}
