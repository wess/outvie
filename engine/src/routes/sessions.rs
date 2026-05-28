use std::{path::PathBuf, sync::Arc};

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    cores::System,
    manager::Manager,
    session::{spawn, SessionSpec},
};

#[derive(Debug, Deserialize)]
pub struct CreateBody {
    pub system: System,
    #[serde(rename = "romPath")]
    pub rom_path: PathBuf,
    #[serde(default, rename = "savePath")]
    pub save_path: Option<PathBuf>,
}

#[derive(Debug, Serialize)]
pub struct CreateResponse {
    pub id: String,
    pub system: System,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    #[serde(rename = "sampleRate")]
    pub sample_rate: u32,
    #[serde(rename = "wsPath")]
    pub ws_path: String,
}

pub async fn create(
    State(manager): State<Arc<Manager>>,
    Json(body): Json<CreateBody>,
) -> Result<Json<CreateResponse>, (StatusCode, String)> {
    let id = Uuid::new_v4().simple().to_string();
    let spec = SessionSpec {
        id: id.clone(),
        system: body.system,
        rom_path: body.rom_path,
        save_path: body.save_path,
    };

    let session = spawn(spec)
        .await
        .map_err(|err| (StatusCode::UNPROCESSABLE_ENTITY, format!("{err:#}")))?;
    let session = Arc::new(session);
    let response = CreateResponse {
        id: session.id.clone(),
        system: session.system,
        width: session.width,
        height: session.height,
        fps: session.fps,
        sample_rate: session.sample_rate,
        ws_path: format!("/v1/sessions/{}/ws", session.id),
    };
    manager.insert(session);
    Ok(Json(response))
}

pub async fn destroy(
    State(manager): State<Arc<Manager>>,
    Path(id): Path<String>,
) -> StatusCode {
    match manager.remove(&id) {
        Some(session) => {
            session.shutdown();
            StatusCode::NO_CONTENT
        }
        None => StatusCode::NOT_FOUND,
    }
}
