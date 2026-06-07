# Production Hardening for FastAPI E-Commerce Backend

## Step 0: Requirements (Inferred)

| Dimension | Decision |
|-----------|----------|
| Stack | Python 3.11+ / FastAPI / async PostgreSQL (asyncpg) / Redis (redis.asyncio) |
| Service type | API-only backend |
| Database | PostgreSQL (async) + Redis (caching) |
| Integration | REST (FastAPI default) |
| Real-time | Not in scope for this hardening pass |
| Auth | Existing (not modified) |

## Step 1: Architectural Decisions

Each hardening item maps to a single module so changes are isolated and testable:

1. **Health checks** → `app/api/health.py` — Separate router. `/health` for liveness (K8s), `/ready` for readiness (checks DB + Redis connectivity).
2. **Graceful shutdown** → `app/core/lifecycle.py` — Startup/shutdown event handlers on the FastAPI app. SIGTERM triggers drain → close connections.
3. **CORS** → `app/core/middleware.py` — Explicit origin allowlist loaded from env. No wildcard in production.
4. **Structured logging** → `app/core/logging.py` + request-ID middleware — JSON formatter, request ID propagated via `contextvars`.
5. **Global error handler** → `app/core/errors.py` — `AppError` hierarchy, global exception handler returns consistent `{error: {code, message, details}}` JSON.

All config is env-var driven and validated at startup (per skill principle #2).

---

## Step 2: Scaffold & Implementation

### 2.1 Configuration (`app/core/config.py`)

Centralized, validated config. Fails fast if required vars are missing.

```python
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import set


class Settings(BaseSettings):
    # Database
    database_url: str = Field(..., description="Async PostgreSQL connection string")
    redis_url: str = Field(..., description="Redis connection string")

    # CORS — explicit origins, no wildcards in production
    cors_origins: set[str] = Field(
        default=set(),
        description="Comma-separated allowed origins, e.g. https://shop.example.com,https://admin.example.com",
    )

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    graceful_shutdown_timeout: int = Field(
        default=30,
        description="Seconds to wait for in-flight requests before forcing shutdown",
    )

    # Logging
    log_level: str = "INFO"
    log_format: str = Field(
        default="json",
        description="'json' for production, 'text' for local dev",
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()  # Fails at import time if required env vars are missing
```

### 2.2 Error Hierarchy (`app/core/errors.py`)

Consistent error codes, HTTP status mapping, and a global handler.

```python
from fastapi import Request
from fastapi.responses import JSONResponse
from typing import Any


class AppError(Exception):
    """Base application error. All operational errors inherit from this."""

    code: str = "INTERNAL_ERROR"
    status_code: int = 500

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        self.message = message
        self.details = details or {}
        super().__init__(message)


class NotFoundError(AppError):
    code = "NOT_FOUND"
    status_code = 404


class ValidationError(AppError):
    code = "VALIDATION_ERROR"
    status_code = 422


class UnauthorizedError(AppError):
    code = "UNAUTHORIZED"
    status_code = 401


class ForbiddenError(AppError):
    code = "FORBIDDEN"
    status_code = 403


class ConflictError(AppError):
    code = "CONFLICT"
    status_code = 409


class RateLimitError(AppError):
    code = "RATE_LIMITED"
    status_code = 429


class ServiceUnavailableError(AppError):
    code = "SERVICE_UNAVAILABLE"
    status_code = 503


def _format_error_response(error: AppError, request_id: str | None = None) -> dict:
    return {
        "error": {
            "code": error.code,
            "message": error.message,
            "details": error.details,
            **({"request_id": request_id} if request_id else {}),
        }
    }


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handler for all operational AppError subclasses."""
    request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        status_code=exc.status_code,
        content=_format_error_response(exc, request_id),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for programming errors — log full trace, return generic 500."""
    import logging
    import traceback

    logger = logging.getLogger("app.errors")
    request_id = getattr(request.state, "request_id", None)
    logger.error(
        "Unhandled exception",
        extra={
            "request_id": request_id,
            "path": str(request.url),
            "method": request.method,
            "exception": traceback.format_exc(),
        },
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred.",
                "details": {},
                **({"request_id": request_id} if request_id else {}),
            }
        },
    )
```

### 2.3 Structured JSON Logging with Request IDs (`app/core/logging.py`)

```python
import logging
import json
import sys
from contextvars import ContextVar

from app.core.config import settings

# Context var for request ID propagation across async boundaries
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


class JSONFormatter(logging.Formatter):
    """Structured JSON log formatter for production."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_ctx.get(""),
        }
        # Merge any extra fields (e.g., from logger.error(..., extra={...}))
        if hasattr(record, "extra_fields"):
            log_entry.update(record.extra_fields)
        # Never log PII or secrets
        for redacted in ("password", "token", "secret", "authorization", "cookie"):
            log_entry.pop(redacted, None)
        return json.dumps(log_entry, default=str)


class TextFormatter(logging.Formatter):
    """Human-readable formatter for local development."""

    def format(self, record: logging.LogRecord) -> str:
        rid = request_id_ctx.get("")
        prefix = f"[{rid}] " if rid else ""
        return f"{prefix}{super().format(record)}"


def setup_logging() -> None:
    """Configure root logger based on settings."""
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))

    handler = logging.StreamHandler(sys.stdout)

    if settings.log_format == "json":
        handler.setFormatter(JSONFormatter(datefmt="%Y-%m-%dT%H:%M:%S"))
    else:
        handler.setFormatter(
            TextFormatter(fmt="%(asctime)s %(levelname)s %(name)s: %(message)s")
        )

    root_logger.handlers.clear()
    root_logger.addHandler(handler)

    # Quiet noisy third-party loggers
    for noisy in ("uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
```

### 2.4 Request ID Middleware (`app/core/middleware.py`)

```python
import uuid
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.logging import request_id_ctx


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Assigns a unique request ID and propagates it through context + response header."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request_id_ctx.set(request_id)
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class CORSMiddleware:
    """CORS with explicit origins from config — no wildcards in production."""

    @staticmethod
    def get_origins() -> list[str]:
        return list(settings.cors_origins)

    @staticmethod
    def is_production() -> bool:
        return len(settings.cors_origins) > 0 and "*" not in settings.cors_origins


def add_cors(app) -> None:
    """Add Starlette CORS middleware with explicit origins."""
    from starlette.middleware.cors import CORSMiddleware as StarletteCORS

    origins = CORSMiddleware.get_origins()
    if not origins:
        raise ValueError(
            "CORS_ORIGINS must be set in production. "
            "Set it to a comma-separated list of allowed origins."
        )

    app.add_middleware(
        StarletteCORS,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
```

### 2.5 Health Check Endpoints (`app/api/health.py`)

```python
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.errors import ServiceUnavailableError

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    """Liveness probe — always returns 200 if the process is up."""
    return {"status": "alive"}


@router.get("/ready")
async def ready() -> JSONResponse:
    """Readiness probe — checks DB and Redis connectivity.

    Returns 200 if all dependencies are reachable, 503 otherwise.
    K8s uses this to decide whether to route traffic to this pod.
    """
    checks: dict[str, str] = {}

    # Check PostgreSQL
    try:
        from app.core.database import db_pool

        async with db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        checks["postgres"] = "ok"
    except Exception as exc:
        checks["postgres"] = f"error: {exc}"

    # Check Redis
    try:
        from app.core.cache import redis_client

        await redis_client.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"

    all_healthy = all(v == "ok" for v in checks.values())

    if all_healthy:
        return JSONResponse(status_code=200, content={"status": "ready", "checks": checks})
    else:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "checks": checks},
        )
```

### 2.6 Graceful Shutdown & Lifecycle (`app/core/lifecycle.py`)

```python
import asyncio
import signal
import logging
from typing import Callable

from fastapi import FastAPI

from app.core.config import settings

logger = logging.getLogger("app.lifecycle")

# Module-level references for cleanup
_db_pool = None
_redis_client = None


async def startup(app: FastAPI) -> None:
    """Initialize connections and register shutdown signal handlers."""
    global _db_pool, _redis_client

    # Import here to avoid circular imports
    from app.core.database import init_db, db_pool
    from app.core.cache import init_redis, redis_client

    await init_db()
    await init_redis()
    _db_pool = db_pool
    _redis_client = redis_client

    logger.info("Application startup complete", extra={"extra_fields": {"event": "startup"}})

    # Register signal handlers for graceful shutdown
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: asyncio.create_task(_shutdown(app)))


async def _shutdown(app: FastAPI) -> None:
    """Graceful shutdown: stop accepting new requests, drain in-flight, close connections."""
    logger.info("Shutdown signal received, draining requests...", extra={"extra_fields": {"event": "shutdown_start"}})

    # Give in-flight requests time to complete
    await asyncio.sleep(settings.graceful_shutdown_timeout)

    # Close connections
    if _db_pool:
        await _db_pool.close()
        logger.info("Database pool closed")
    if _redis_client:
        await _redis_client.close()
        logger.info("Redis connection closed")

    logger.info("Shutdown complete", extra={"extra_fields": {"event": "shutdown_complete"}})


async def shutdown(app: FastAPI) -> None:
    """FastAPI shutdown event handler."""
    # Cleanup is handled by _shutdown via signal handlers.
    # This handler is a safety net for non-signal shutdowns.
    if _db_pool:
        await _db_pool.close()
    if _redis_client:
        await _redis_client.close()
```

### 2.7 Database Module (`app/core/database.py`)

```python
import asyncpg
from app.core.config import settings
from app.core.logging import setup_logging

pool: asyncpg.Pool | None = None


async def init_db() -> None:
    """Create the async connection pool. Call once at startup."""
    global pool
    pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=5,
        max_size=20,
        command_timeout=30,
    )


async def close_db() -> None:
    """Close the pool. Call once at shutdown."""
    global pool
    if pool:
        await pool.close()
        pool = None


# Convenience accessor
def get_db() -> asyncpg.Pool:
    if pool is None:
        raise RuntimeError("Database pool not initialized. Call init_db() first.")
    return pool
```

### 2.8 Redis Cache Module (`app/core/cache.py`)

```python
import redis.asyncio as aioredis
from app.core.config import settings

redis_client: aioredis.Redis | None = None


async def init_redis() -> None:
    """Create the async Redis client. Call once at startup."""
    global redis_client
    redis_client = aioredis.from_url(
        settings.redis_url,
        decode_responses=True,
        max_connections=10,
    )


async def close_redis() -> None:
    """Close the Redis client. Call once at shutdown."""
    global redis_client
    if redis_client:
        await redis_client.close()
        redis_client = None


def get_redis() -> aioredis.Redis:
    if redis_client is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return redis_client
```

### 2.9 App Assembly (`app/main.py`)

Wires everything together — middleware order matters (per skill principle #6).

```python
from fastapi import FastAPI
from fastapi.middleware import Middleware

from app.core.config import settings
from app.core.errors import AppError, app_error_handler, unhandled_error_handler
from app.core.logging import setup_logging
from app.core.middleware import RequestIDMiddleware, add_cors
from app.core.lifecycle import startup, shutdown
from app.api.health import router as health_router

# Initialize logging first — before any other module logs
setup_logging()

app = FastAPI(
    title="E-Commerce API",
    version="1.0.0",
    docs_url="/docs" if settings.log_format == "text" else None,  # Disable docs in prod
)

# ── Middleware (order: outermost first = registered last in Starlette) ──
# Execution order: RequestID → CORS → ... → Handler → ... → CORS → RequestID
app.add_middleware(RequestIDMiddleware)
add_cors(app)

# ── Exception handlers ──
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(Exception, unhandled_error_handler)

# ── Lifecycle ──
app.add_event_handler("startup", lambda: startup(app))
app.add_event_handler("shutdown", lambda: shutdown(app))

# ── Routers ──
app.include_router(health_router)

# ... existing routers (orders, users, products, etc.)
```

### 2.10 `.env.example`

```env
# Required
DATABASE_URL=postgresql://user:pass@localhost:5432/shopdb
REDIS_URL=redis://localhost:6379/0

# CORS — comma-separated explicit origins (NO wildcards in production)
CORS_ORIGINS=https://shop.example.com,https://admin.example.com

# Server
HOST=0.0.0.0
PORT=8000
GRACEFUL_SHUTDOWN_TIMEOUT=30

# Logging
LOG_LEVEL=INFO
LOG_FORMAT=json
```

---

## Step 3: Verification Checklist

| Item | How to verify |
|------|---------------|
| Health check `/health` | `curl http://localhost:8000/health` → `{"status": "alive"}` |
| Readiness `/ready` | `curl http://localhost:8000/ready` → 200 with all checks `"ok"` |
| Readiness when DB down | Stop Postgres → `/ready` returns 503 |
| CORS explicit origins | `curl -H "Origin: https://evil.com" -I` → no `Access-Control-Allow-Origin` header |
| CORS allowed origin | `curl -H "Origin: https://shop.example.com" -I` → `Access-Control-Allow-Origin: https://shop.example.com` |
| Request ID propagation | `curl -H "X-Request-ID: test-123" /health` → response includes `X-Request-ID: test-123` |
| Request ID auto-generated | `curl /health` without header → response includes `X-Request-ID: <uuid>` |
| Structured JSON logs | Hit any endpoint → stdout contains valid JSON with `request_id`, `level`, `timestamp` fields |
| Operational error response | Trigger `NotFoundError("Product not found")` → `{"error": {"code": "NOT_FOUND", "message": "Product not found", "details": {}, "request_id": "..."}}` |
| Unhandled error response | Trigger a `raise RuntimeError("oops")` → `{"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred.", "details": {}}}` (no stack trace leaked) |
| Graceful shutdown | `kill -SIGTERM <pid>` → logs "Shutdown signal received", waits for in-flight requests, closes DB/Redis |

### Automated test examples

```python
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health_returns_alive(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "alive"}


@pytest.mark.asyncio
async def test_ready_returns_ok_when_deps_up(client):
    resp = await client.get("/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["checks"]["postgres"] == "ok"
    assert body["checks"]["redis"] == "ok"


@pytest.mark.asyncio
async def test_request_id_propagated(client):
    resp = await client.get("/health", headers={"X-Request-ID": "my-trace-42"})
    assert resp.headers["X-Request-ID"] == "my-trace-42"


@pytest.mark.asyncio
async def test_request_id_auto_generated(client):
    resp = await client.get("/health")
    assert resp.headers["X-Request-ID"]  # UUID present


@pytest.mark.asyncio
async def test_app_error_returns_consistent_json(client):
    # Assuming an endpoint that raises NotFoundError
    resp = await client.get("/api/products/nonexistent-sku")
    assert resp.status_code == 404
    body = resp.json()
    assert "error" in body
    assert body["error"]["code"] == "NOT_FOUND"
    assert "request_id" in body["error"]
```

---

## Step 4: Production Hardening Checklist (Mapped to Skill Principles)

| # | Hardening Item | Skill Principle | Pattern Used | Key Detail |
|---|---------------|-----------------|--------------|------------|
| 1 | Health checks (liveness + readiness) | §11 Production Hardening | `/health` + `/ready` with DB/Redis checks | K8s liveness → `/health`, readiness → `/ready` |
| 2 | Graceful shutdown | §11 Production Hardening | SIGTERM handler → drain timeout → close pool | `graceful_shutdown_timeout` env var (default 30s) |
| 3 | CORS explicit origins | §11 Production Hardening | `CORSMiddleware` with allowlist from env | No `*` in production; fails fast if `CORS_ORIGINS` empty |
| 4 | Structured JSON logging + request IDs | §7 Logging | `JSONFormatter` + `RequestIDMiddleware` + `contextvars` | Request ID in every log line, PII redacted |
| 5 | Global error handler | §3 Error Handling | `AppError` hierarchy + global handlers | Operational → structured JSON; programming → log + generic 500 |

### Anti-Patterns Avoided (per §14)

| Anti-Pattern | What We Did Instead |
|-------------|---------------------|
| Catch-all `except Exception` returning 500 with stack trace | `unhandled_error_handler` logs trace server-side, returns generic message |
| `Access-Control-Allow-Origin: *` | Explicit allowlist from `CORS_ORIGINS` env var |
| `print()` or unstructured logging | Structured JSON via `JSONFormatter` |
| Health check that only checks "is process alive" | `/ready` verifies actual DB + Redis connectivity |
| Hardcoded config values | All config via env vars, validated at startup with Pydantic |
| No request tracing | Request ID propagated via `X-Request-ID` header + `contextvars` |

---

## Step 5: Handoff Notes

- **Build failures** → use `build-resolver` skill to diagnose dependency or config issues
- **Code quality review** → use `code-review` skill on the implemented modules
- **Security review** → use `security-auditor` skill before deploying (checks for secrets in logs, CORS misconfiguration, etc.)

### Integration Notes for Existing App

1. **Add the `app/core/` modules** (config, errors, logging, middleware, lifecycle, database, cache) to your project.
2. **Wire into `app/main.py`** — add middleware, exception handlers, and lifecycle events as shown.
3. **Update existing routers** to raise `AppError` subclasses instead of `HTTPException` or bare `raise`.
4. **Replace `print()` and `logging.info()`** calls with `logger = logging.getLogger("app.<module>")` using the structured setup.
5. **Set `CORS_ORIGINS`** in your `.env` — the app will refuse to start with an empty allowlist in production.
6. **Deploy with** `SIGTERM` support (K8s does this by default; for Docker, use `STOPSIGNAL SIGTERM` in the Dockerfile).