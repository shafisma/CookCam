"""
CookCam — Session Store with Firestore persistence.
Falls back to in-memory when Firestore is unavailable.
"""

import time
import uuid
from api.firestore_client import (
    save_session,
    get_session,
    delete_session,
    count_active_sessions,
    is_firestore_connected,
)
from utils.logger import logger


class SessionStore:
    """Session store backed by Firestore (with in-memory fallback)."""

    def __init__(self, ttl_seconds=300):
        self.ttl = ttl_seconds

    def create_token(self, session_id=None):
        token = str(uuid.uuid4())
        data = {
            "created_at": time.time(),
            "session_id": session_id,
            "active": True,
        }
        save_session(token, data)
        return token

    def validate_token(self, token):
        session = get_session(token)
        if not session:
            return False
        if time.time() - session.get("created_at", 0) > self.ttl:
            delete_session(token)
            return False
        return session.get("active", False)

    def invalidate_token(self, token):
        session = get_session(token)
        if session:
            session["active"] = False
            save_session(token, session)

    def active_count(self):
        return count_active_sessions()


session_store = SessionStore()
