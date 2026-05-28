use std::env;

pub struct Config {
    pub host: String,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: env::var("OUTVIE_ENGINE_HOST").unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: env::var("OUTVIE_ENGINE_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(4291),
        }
    }
}
