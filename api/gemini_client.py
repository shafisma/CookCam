import asyncio
import base64
import json
from google import genai
from google.genai import types
from core.config import MODEL, GEMINI_API_KEY, build_config
from api.tools import execute_tool
from utils.logger import logger

MAX_RECONNECTS = 3
RECONNECT_DELAY = 1.5  # seconds

class GeminiLiveClient:
    def __init__(self, websocket, preferences=None):
        self.ws = websocket
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        self.stop_event = asyncio.Event()
        self.config = build_config(preferences)
        self._browser_closed = False

    async def start(self):
        """Start with automatic reconnection on transient Gemini errors."""
        for attempt in range(1, MAX_RECONNECTS + 1):
            self.stop_event.clear()
            try:
                async with self.client.aio.live.connect(model=MODEL, config=self.config) as session:
                    logger.info(f"Gemini Live session established (attempt {attempt})")
                    await self._send_to_browser({"type": "status", "status": "connected"})

                    tasks = [
                        asyncio.create_task(self._receive_from_browser(session)),
                        asyncio.create_task(self._receive_from_gemini(session)),
                    ]
                    try:
                        await asyncio.gather(*tasks)
                    finally:
                        for t in tasks:
                            t.cancel()

            except Exception as e:
                combined = str(e)
                logger.error(f"Gemini Live session error (attempt {attempt}): {combined}")

                # If the browser itself disconnected, no point reconnecting
                if self._browser_closed:
                    break

                # On last attempt, notify browser and give up
                if attempt >= MAX_RECONNECTS:
                    await self._send_to_browser({"type": "error", "message": f"Session failed after {MAX_RECONNECTS} attempts: {combined}"})
                    break

                # Notify browser we're reconnecting, then retry
                logger.info(f"Reconnecting to Gemini in {RECONNECT_DELAY}s...")
                await self._send_to_browser({"type": "status", "status": "reconnecting"})
                await asyncio.sleep(RECONNECT_DELAY)

            else:
                # Clean exit (no exception)
                break

        self.stop_event.set()

    async def _receive_from_browser(self, session):
        try:
            while not self.stop_event.is_set():
                message = await self.ws.receive()

                if message.get("type") == "websocket.disconnect":
                    self._browser_closed = True
                    break

                if "bytes" in message and message["bytes"]:
                    audio_data = message["bytes"]
                    await session.send_realtime_input(
                        audio={"data": audio_data, "mime_type": "audio/pcm"}
                    )

                elif "text" in message and message["text"]:
                    data = json.loads(message["text"])
                    if data.get("type") == "video":
                        frame_bytes = base64.b64decode(data["data"])
                        await session.send_realtime_input(
                            video={"data": frame_bytes, "mime_type": "image/jpeg"}
                        )
                    elif data.get("type") == "text_message":
                        # User typed a text chat message
                        text = data.get("text", "").strip()
                        if text:
                            logger.info(f"User text message: {text[:80]}")
                            await session.send(input=text, end_of_turn=True)
        except Exception as e:
            if "disconnect" in str(e).lower() or "close" in str(e).lower():
                self._browser_closed = True
            logger.error(f"Error receiving from browser: {e}")
        finally:
            self.stop_event.set()

    async def _receive_from_gemini(self, session):
        try:
            while not self.stop_event.is_set():
                turn = session.receive()
                async for response in turn:
                    if self.stop_event.is_set():
                        break

                    # ── Handle tool calls ────────────────────────
                    if response.tool_call:
                        await self._handle_tool_call(session, response.tool_call)
                        continue

                    if not response.server_content:
                        continue

                    if response.server_content.interrupted:
                        await self._send_to_browser({"type": "interrupted"})
                        continue

                    if response.server_content.model_turn:
                        for part in response.server_content.model_turn.parts:
                            if self.stop_event.is_set():
                                break

                            if part.inline_data and part.inline_data.data:
                                audio_b64 = base64.b64encode(part.inline_data.data).decode("utf-8")
                                await self._send_to_browser({"type": "audio", "data": audio_b64})

                            if hasattr(part, "text") and part.text:
                                await self._send_to_browser({"type": "text", "text": part.text})

        except Exception as e:
            logger.error(f"Error receiving from Gemini: {e}")
        finally:
            self.stop_event.set()

    async def _handle_tool_call(self, session, tool_call):
        """Execute tool calls from Gemini and send results back."""
        function_responses = []

        for fc in tool_call.function_calls:
            logger.info(f"Tool call: {fc.name}({fc.args})")

            gemini_result, browser_msg = execute_tool(fc.name, dict(fc.args) if fc.args else {})

            # Forward UI update to the browser
            if browser_msg:
                await self._send_to_browser(browser_msg)

            # Build response — include id if the API provided one
            fr_kwargs = {"name": fc.name, "response": gemini_result}
            fc_id = getattr(fc, "id", None)
            if fc_id:
                fr_kwargs["id"] = fc_id

            function_responses.append(types.FunctionResponse(**fr_kwargs))

        # Send tool results back to Gemini so it can continue
        try:
            await session.send_tool_response(function_responses=function_responses)
        except Exception as e:
            logger.error(f"Error sending tool response: {e}")

    async def _send_to_browser(self, message):
        try:
            await self.ws.send_json(message)
        except Exception:
            self.stop_event.set()
