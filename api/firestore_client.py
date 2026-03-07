"""
CookCam — Firestore persistent storage layer.

Provides a unified interface for recipes and sessions.
Falls back to in-memory dicts when Firestore is unavailable
(no credentials or FIRESTORE_DISABLED=true), so local dev
works without any Google Cloud setup.
"""

import os
import time
from datetime import datetime
from utils.logger import logger

# ─── Firestore initialization ────────────────────────────────────────────

_db = None
_firestore_available = False

def _init_firestore():
    """Lazy-init Firestore client. Safe to call multiple times."""
    global _db, _firestore_available

    if _db is not None:
        return

    if os.getenv("FIRESTORE_DISABLED", "").lower() in ("true", "1", "yes"):
        logger.info("Firestore disabled via FIRESTORE_DISABLED env var — using in-memory storage")
        return

    try:
        from google.cloud import firestore
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT") or os.getenv("GCP_PROJECT")
        _db = firestore.Client(project=project_id) if project_id else firestore.Client()
        _firestore_available = True
        logger.info(f"Firestore connected (project: {_db.project})")
    except Exception as e:
        logger.warning(f"Firestore unavailable — falling back to in-memory storage ({e})")


_init_firestore()

# ─── In-memory fallbacks ─────────────────────────────────────────────────

_mem_recipes: list[dict] = []
_mem_sessions: dict[str, dict] = {}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  RECIPES
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RECIPES_COLLECTION = "recipes"

def save_recipe(recipe: dict) -> dict:
    """Persist a recipe. Returns the recipe dict (with id)."""
    if _firestore_available:
        try:
            doc_ref = _db.collection(RECIPES_COLLECTION).document(recipe["id"])
            doc_ref.set(recipe)
            logger.info(f"Recipe '{recipe.get('title')}' saved to Firestore")
            return recipe
        except Exception as e:
            logger.error(f"Firestore save_recipe failed, falling back to memory: {e}")

    # In-memory fallback
    _mem_recipes.append(recipe)
    return recipe


def get_all_recipes() -> list[dict]:
    """Return all saved recipes, newest first."""
    if _firestore_available:
        try:
            docs = (
                _db.collection(RECIPES_COLLECTION)
                .order_by("saved_at", direction="DESCENDING")
                .stream()
            )
            return [doc.to_dict() for doc in docs]
        except Exception as e:
            logger.error(f"Firestore get_all_recipes failed: {e}")

    return list(_mem_recipes)


def get_recipe_by_id(recipe_id: str) -> dict | None:
    """Fetch a single recipe by ID."""
    if _firestore_available:
        try:
            doc = _db.collection(RECIPES_COLLECTION).document(recipe_id).get()
            return doc.to_dict() if doc.exists else None
        except Exception as e:
            logger.error(f"Firestore get_recipe_by_id failed: {e}")

    for r in _mem_recipes:
        if r.get("id") == recipe_id:
            return r
    return None


def delete_recipe(recipe_id: str) -> bool:
    """Delete a recipe. Returns True if it existed."""
    if _firestore_available:
        try:
            doc_ref = _db.collection(RECIPES_COLLECTION).document(recipe_id)
            doc = doc_ref.get()
            if doc.exists:
                doc_ref.delete()
                logger.info(f"Recipe {recipe_id} deleted from Firestore")
                return True
            return False
        except Exception as e:
            logger.error(f"Firestore delete_recipe failed: {e}")

    for i, r in enumerate(_mem_recipes):
        if r.get("id") == recipe_id:
            _mem_recipes.pop(i)
            return True
    return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  SESSIONS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SESSIONS_COLLECTION = "sessions"

def save_session(token: str, data: dict) -> None:
    """Persist a session record."""
    if _firestore_available:
        try:
            _db.collection(SESSIONS_COLLECTION).document(token).set(data)
            return
        except Exception as e:
            logger.error(f"Firestore save_session failed: {e}")

    _mem_sessions[token] = data


def get_session(token: str) -> dict | None:
    """Retrieve a session by token."""
    if _firestore_available:
        try:
            doc = _db.collection(SESSIONS_COLLECTION).document(token).get()
            return doc.to_dict() if doc.exists else None
        except Exception as e:
            logger.error(f"Firestore get_session failed: {e}")

    return _mem_sessions.get(token)


def delete_session(token: str) -> None:
    """Remove a session."""
    if _firestore_available:
        try:
            _db.collection(SESSIONS_COLLECTION).document(token).delete()
            return
        except Exception as e:
            logger.error(f"Firestore delete_session failed: {e}")

    _mem_sessions.pop(token, None)


def count_active_sessions() -> int:
    """Count currently active sessions."""
    now = time.time()
    if _firestore_available:
        try:
            docs = (
                _db.collection(SESSIONS_COLLECTION)
                .where("active", "==", True)
                .stream()
            )
            return sum(1 for _ in docs)
        except Exception as e:
            logger.error(f"Firestore count_active_sessions failed: {e}")

    return sum(
        1 for s in _mem_sessions.values()
        if s.get("active") and now - s.get("created_at", 0) < 300
    )


def is_firestore_connected() -> bool:
    """Check if Firestore is the active backend."""
    return _firestore_available
