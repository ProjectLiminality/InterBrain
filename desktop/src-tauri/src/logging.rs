//! Structured logging — daily-rolling JSONL file in the daemon's config dir.
//!
//! Layered tracing subscriber:
//!   - stderr (compact human-readable) for `tauri dev` and console invocation
//!   - file (JSON-per-line) at `${TAURI_CONFIG_DIR}/logs/daemon.YYYY-MM-DD.log`
//!
//! Reading:
//!   ssh win 'Get-Content "$env:APPDATA\org.projectliminality.interbrain\logs\daemon.*.log" -Tail 100'
//!   ssh win 'Get-Content -Wait -Tail 0 "$env:APPDATA\..."'  # follow live

use std::path::PathBuf;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Initialize logging. Returns the WorkerGuard that must be held for the
/// life of the process to keep the file appender alive.
pub fn init(log_dir: PathBuf) -> WorkerGuard {
    std::fs::create_dir_all(&log_dir).ok();

    let file_appender = tracing_appender::rolling::daily(&log_dir, "daemon.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,interbrain_desktop=debug"));

    let stderr_layer = fmt::layer()
        .with_target(true)
        .with_writer(std::io::stderr);
    let file_layer = fmt::layer()
        .json()
        .with_target(true)
        .with_thread_ids(false)
        .with_current_span(false)
        .with_span_list(false)
        .with_writer(non_blocking);

    tracing_subscriber::registry()
        .with(env_filter)
        .with(stderr_layer)
        .with(file_layer)
        .init();

    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        log_dir = %log_dir.display(),
        "logging initialized"
    );

    guard
}
