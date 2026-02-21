use axum::{
    body::Body,
    http::{header, Response, StatusCode, Uri},
    response::IntoResponse,
};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "$CARGO_MANIFEST_DIR/../web/.next/static/"]
#[prefix = "_next/static/"]
struct NextStatic;

#[derive(RustEmbed)]
#[folder = "$CARGO_MANIFEST_DIR/../web/public/"]
#[prefix = ""]
struct PublicAssets;

pub async fn serve_static_asset(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');

    // Try _next/static/ assets first
    if path.starts_with("_next/static/") {
        if let Some(file) = NextStatic::get(path) {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            return Response::builder()
                .header(header::CONTENT_TYPE, mime.as_ref())
                .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
                .body(Body::from(file.data.into_owned()))
                .unwrap()
                .into_response();
        }
    }

    // Try public/ assets
    if let Some(file) = PublicAssets::get(path) {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        return Response::builder()
            .header(header::CONTENT_TYPE, mime.as_ref())
            .body(Body::from(file.data.into_owned()))
            .unwrap()
            .into_response();
    }

    StatusCode::NOT_FOUND.into_response()
}
