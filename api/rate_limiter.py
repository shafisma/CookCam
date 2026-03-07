"""
CookCam — Token bucket rate limiter for API endpoints.
"""

import time
from collections import defaultdict


class RateLimiter:
    """Simple sliding-window rate limiter."""

    def __init__(self, max_requests=60, window_seconds=60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._requests = defaultdict(list)

    def is_allowed(self, client_id: str) -> bool:
        now = time.time()
        self._requests[client_id] = [
            t for t in self._requests[client_id] if now - t < self.window
        ]
        if len(self._requests[client_id]) >= self.max_requests:
            return False
        self._requests[client_id].append(now)
        return True

    def remaining(self, client_id: str) -> int:
        now = time.time()
        self._requests[client_id] = [
            t for t in self._requests[client_id] if now - t < self.window
        ]
        return max(0, self.max_requests - len(self._requests[client_id]))


rate_limiter = RateLimiter()
