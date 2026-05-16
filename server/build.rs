use std::fs;
use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=../web/out");

    let web_out = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("../web/out");

    if !web_out.exists() {
        fs::create_dir_all(&web_out).expect("failed to create web/out placeholder");
    }

    let index = web_out.join("index.html");
    if !index.exists() {
        fs::write(
            index,
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>Panoptikon</title></head><body>Panoptikon frontend assets were not built.</body></html>",
        )
        .expect("failed to write web/out placeholder index");
    }
}
