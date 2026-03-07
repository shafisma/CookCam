"""
CookCam — Live AI Cooking Coach
Modularized Server Entry Point
"""

import os
import json
import time
import asyncio
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from api.gemini_client import GeminiLiveClient
from api.tools import get_saved_recipes
from api.firestore_client import get_recipe_by_id, delete_recipe, is_firestore_connected
from api.rate_limiter import rate_limiter
from api.session_store import session_store
from utils.logger import logger
from core.config import GEMINI_API_KEY

app = FastAPI(title="CookCam", description="Live AI Cooking Coach")

# ─── Request log for logging dashboard ───────────────────────────────────
_request_log = []

# ─── Combined middleware: logging + rate limiting ────────────────────────

@app.middleware("http")
async def main_middleware(request: Request, call_next):
    start = time.time()

    # Rate limiting (skip static & health)
    path = request.url.path
    if not path.startswith("/static") and path != "/health":
        client_ip = request.client.host if request.client else "unknown"
        if not rate_limiter.is_allowed(client_ip):
            return JSONResponse(
                status_code=429,
                content={"error": "Too many requests. Please try again later."},
                headers={"Retry-After": "60"},
            )

    response = await call_next(request)

    # Structured logging
    duration_ms = round((time.time() - start) * 1000, 2)
    entry = {
        "timestamp": datetime.now().isoformat(),
        "method": request.method,
        "path": path,
        "status": response.status_code,
        "duration_ms": duration_ms,
        "client": request.client.host if request.client else "unknown",
    }
    _request_log.append(entry)
    if len(_request_log) > 1000:
        _request_log.pop(0)

    if not path.startswith("/static"):
        logger.info(f"{entry['method']} {entry['path']} → {entry['status']} ({duration_ms}ms)")

    # Rate limit header
    if not path.startswith("/static"):
        client_ip = request.client.host if request.client else "unknown"
        response.headers["X-RateLimit-Remaining"] = str(rate_limiter.remaining(client_ip))

    return response

# Mount Static Files
app.mount("/static", StaticFiles(directory="static"), name="static")

# ─── Health Check ────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.2.0",
        "api_key_configured": bool(GEMINI_API_KEY),
        "firestore_connected": is_firestore_connected(),
        "active_sessions": session_store.active_count(),
    }

# ─── Recipe History API ──────────────────────────────────────────────────

@app.get("/api/recipes")
async def list_recipes():
    return {"recipes": get_saved_recipes()}

@app.get("/api/recipes/{recipe_id}")
async def get_recipe(recipe_id: str):
    recipe = get_recipe_by_id(recipe_id)
    if recipe:
        return recipe
    return JSONResponse(status_code=404, content={"error": "Recipe not found"})

@app.delete("/api/recipes/{recipe_id}")
async def remove_recipe(recipe_id: str):
    if delete_recipe(recipe_id):
        return {"status": "deleted", "id": recipe_id}
    return JSONResponse(status_code=404, content={"error": "Recipe not found"})

# ─── Logging Dashboard API ───────────────────────────────────────────────

@app.get("/api/logs")
async def get_logs(limit: int = 50):
    return {"logs": _request_log[-limit:]}

# ─── WebSocket Endpoint ──────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("Browser WebSocket connected")

    if not GEMINI_API_KEY:
        await websocket.send_json({"type": "error", "message": "GEMINI_API_KEY not configured."})
        await websocket.close()
        return

    # Wait for init message with user preferences
    preferences = None
    try:
        first_msg = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
        init_data = json.loads(first_msg)
        if init_data.get("type") == "init":
            preferences = init_data.get("preferences")
            logger.info(f"Session init with preferences: {preferences}")
    except (asyncio.TimeoutError, json.JSONDecodeError, Exception) as e:
        logger.info(f"No init message received, using defaults ({e})")

    # Issue session token
    token = session_store.create_token()
    await websocket.send_json({"type": "session_token", "token": token})

    client = GeminiLiveClient(websocket, preferences=preferences)
    await client.start()

    session_store.invalidate_token(token)
    logger.info("Session closed")

# ─── Root ────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
