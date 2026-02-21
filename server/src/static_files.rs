use axum::{
    body::Body,
    http::{header, Response, StatusCode, Uri},
    response::IntoResponse,
};
use rust_embed::RustEmbed;

/// Embeds the entire Next.js static export output (web/out/).
/// This ensures HTML pages and JS chunks always come from the same build,
/// preventing hash mismatches when bun build runs without cargo rebuild.
#[derive(RustEmbed)]
#[folder = "$CARGO_MANIFEST_DIR/../web/out/"]
#[prefix = ""]
struct WebOut;

pub async fn serve_static_asset(uri: Uri) -> impl IntoResponse {
    let raw_path = uri.path().trim_start_matches('/');

    // 1. Try exact path match (JS chunks, CSS, images, etc.)
    if !raw_path.is_empty() {
        if let Some(file) = WebOut::get(raw_path) {
            let mime = mime_guess::from_path(raw_path).first_or_octet_stream();
            let cache = if raw_path.starts_with("_next/static/") {
                "public, max-age=31536000, immutable"
            } else {
                "no-cache, no-store"
            };
            return Response::builder()
                .header(header::CONTENT_TYPE, mime.as_ref())
                .header(header::CACHE_CONTROL, cache)
                .body(Body::from(file.data.into_owned()))
                .unwrap()
                .into_response();
        }
    }

    // 2. Try path/index.html (Next.js static export page structure)
    let index_path = if raw_path.is_empty() {
        "index.html".to_string()
    } else {
        format!("{}/index.html", raw_path.trim_end_matches('/'))
    };
    if let Some(file) = WebOut::get(&index_path) {
        return Response::builder()
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CACHE_CONTROL, "no-cache, no-store")
            .body(Body::from(file.data.into_owned()))
            .unwrap()
            .into_response();
    }

    // 3. SPA fallback: serve root index.html for client-side routing
    if let Some(file) = WebOut::get("index.html") {
        return Response::builder()
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CACHE_CONTROL, "no-cache, no-store")
            .body(Body::from(file.data.into_owned()))
            .unwrap()
            .into_response();
    }

    StatusCode::NOT_FOUND.into_response()
}
