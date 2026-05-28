use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, State,
    },
    response::IntoResponse,
};
use futures_util::{sink::SinkExt, stream::StreamExt};
use serde::Deserialize;
use tokio::sync::broadcast::error::RecvError;

use crate::{
    cores::Button,
    manager::Manager,
    session::{Command, Outbound, Session},
};

pub async fn handler(
    State(manager): State<Arc<Manager>>,
    Path(id): Path<String>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let session = manager.get(&id);
    ws.on_upgrade(move |socket| async move {
        match session {
            Some(s) => run(socket, s).await,
            None => {
                let _ = socket.close().await;
            }
        }
    })
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum ClientMsg {
    Input {
        player: u8,
        button: Button,
        pressed: bool,
    },
    Reset,
    Pause,
    Resume,
}

async fn run(socket: WebSocket, session: Arc<Session>) {
    let (mut sink, mut stream) = socket.split();
    let mut rx_out = session.subscribe();

    let hello = serde_json::json!({
        "type": "hello",
        "id": session.id,
        "system": session.system,
        "width": session.width,
        "height": session.height,
        "fps": session.fps,
        "sampleRate": session.sample_rate,
    })
    .to_string();
    if sink.send(Message::Text(hello)).await.is_err() {
        return;
    }

    let send_task: tokio::task::JoinHandle<()> = tokio::spawn(async move {
        loop {
            match rx_out.recv().await {
                Ok(Outbound::Binary(bytes)) => {
                    if sink.send(Message::Binary(bytes.to_vec())).await.is_err() {
                        return;
                    }
                }
                Ok(Outbound::Text(text)) => {
                    if sink.send(Message::Text(text)).await.is_err() {
                        return;
                    }
                }
                Err(RecvError::Lagged(_)) => continue,
                Err(RecvError::Closed) => return,
            }
        }
    });

    let recv_session = session.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(msg) = stream.next().await {
            let Ok(msg) = msg else { break };
            match msg {
                Message::Text(text) => {
                    let Ok(parsed) = serde_json::from_str::<ClientMsg>(&text) else { continue };
                    match parsed {
                        ClientMsg::Input { player, button, pressed } => {
                            recv_session.send(Command::Input { player, button, pressed });
                        }
                        ClientMsg::Reset => recv_session.send(Command::Reset),
                        ClientMsg::Pause => recv_session.send(Command::Pause),
                        ClientMsg::Resume => recv_session.send(Command::Resume),
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = send_task => {}
        _ = recv_task => {}
    }
}
