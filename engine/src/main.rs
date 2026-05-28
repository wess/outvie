use std::{net::SocketAddr, sync::Arc};

use axum::{
    routing::{delete, get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::EnvFilter;

mod catalog;
mod config;
mod cores;
mod manager;
mod session;
mod routes {
    pub mod sessions;
    pub mod ws;
}

use crate::{config::Config, manager::Manager};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with_target(false)
        .compact()
        .init();

    let cfg = Config::from_env();
    let addr: SocketAddr = format!("{}:{}", cfg.host, cfg.port).parse()?;

    let manager = Arc::new(Manager::new());

    let app = Router::new()
        .route("/v1/health", get(|| async { "ok" }))
        .route("/v1/sessions", post(routes::sessions::create))
        .route("/v1/sessions/:id", delete(routes::sessions::destroy))
        .route("/v1/sessions/:id/ws", get(routes::ws::handler))
        .with_state(manager)
        .layer(
            CorsLayer::new()
                .allow_methods(Any)
                .allow_headers(Any)
                .allow_origin(Any),
        );

    tracing::info!("outvie-engine listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutdown signal received");
}
