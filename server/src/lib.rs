// clippy 1.98 (result_large_err): handlers return Result<_, axum::response::Response>; boxing every
// error response is churn for no runtime gain, so the lint is allowed crate-wide.
#![allow(clippy::result_large_err)]
pub mod api;
pub mod config;
pub mod db;
pub mod device_resolver;
pub mod dhcp;
pub mod enrichment;
pub mod mdns;
pub mod mikrotik;
pub mod mikrotik_traffic;
pub mod netflow;
pub mod npm;
pub mod oui;
pub mod pfsense;
pub mod retention;
pub mod scanner;
pub mod speedtest_scheduler;
pub mod ssdp;
pub mod ssh;
pub mod static_files;

pub mod email;
pub mod webhook;
pub mod ws;
pub mod xiaomi;
