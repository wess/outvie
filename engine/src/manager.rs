use std::sync::Arc;

use dashmap::DashMap;

use crate::session::Session;

pub struct Manager {
    sessions: DashMap<String, Arc<Session>>,
}

impl Manager {
    pub fn new() -> Self {
        Self { sessions: DashMap::new() }
    }

    pub fn insert(&self, session: Arc<Session>) {
        self.sessions.insert(session.id.clone(), session);
    }

    pub fn get(&self, id: &str) -> Option<Arc<Session>> {
        self.sessions.get(id).map(|entry| entry.clone())
    }

    pub fn remove(&self, id: &str) -> Option<Arc<Session>> {
        self.sessions.remove(id).map(|(_, session)| session)
    }
}
