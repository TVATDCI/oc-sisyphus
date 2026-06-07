# Production Hardening Checklist for FastAPI E-Commerce Backend

This guide walks through five critical production hardening items for a FastAPI backend using async PostgreSQL and Redis. Each section includes the problem it solves, the pattern, and a complete implementation.

---

## Table of Contents

1. [Health Check Endpoints](#1-health-check-endpoints)
2. [Graceful Shutdown](#2-graceful-shutdown)
3. [CORS with Explicit Origins](#3-cors-with-explicit-origins)
4. [Structured JSON Logging with Request IDs](#4-structured-json-logging-with-request-ids)
5. [Global Error Handler](#5-global-error-handler)
6. [Wiring It All Together](#6-wiring-it-all-together)

---

## 1. Health Check Endpoints

### Why

Orchestrators (Kubernetes, ECS, Nomad) and load balancers need to know if your app is alive and ready. A single `/health` endpoint conflates two distinct states:

- **Liveness** — "Is the process running and not deadlocked?" If this fails, the orchestrator restarts the container.
- **Readiness** — "Can the app serve traffic right now?" If this fails, the orchestrator removes the pod from the service mesh but doesn't restart it.

An app can be alive (process is running) but not ready (database connection pool is exhausted). Separating these prevents unnecessary restarts and prevents routing traffic to instances that can't handle requests.

### Pattern

```python
# app/api/health.py

from datetime import datetime, timezone
from fastapi import APIRouter, Response
from ..db import db_pool
from ..cache import redis_pool

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def liveness():
    """Lightweight check: is the process alive? No external calls."""
    return {"status": "alive"}


@router.get("/readyz")
async def readiness(response: Response):
    """
    Deep check: can we serve traffic?
    Verifies PostgreSQL and Redis connectivity.
    Returns 503 if any dependency is unreachable.
    """
    checks = {}
    status_code = 200

    # Check PostgreSQL
    try:
        async with db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        checks["postgres"] = "ok"
    except Exception as e:
        checks["postgres"] = f"error: {e}"
        status_code = 503

    # Check Redis
    try:
        await redis_pool.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"
        status_code = 503

    response.status_code = status_code
    return {
        "status": "ready" if status_code == 200 else "degraded",
        "checks": checks,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
```

### Key Decisions

| Decision | Rationale |
|---|---|
| Separate `/healthz` and `/readyz` | Kubernetes uses different probes for liveness vs readiness. Conflating them causes unnecessary container restarts when a dependency is temporarily down. |
| `/healthz` does no I/O | Liveness probes fire every 10-30s. Hitting the database on every check wastes connections and masks real deadlocks. |
| `/readyz` checks each dependency individually | When Redis is down, you want to know it's Redis specifically, not just "something broke." The per-dependency status makes alerting actionable. |
| 503 on degraded | Load balancers and ingress controllers treat 5xx as "don't route here." Returning 200 on failure means traffic still hits a broken instance. |

---

## 2. Graceful Shutdown

### Why

When Kubernetes sends SIGTERM, your app has a termination grace period (default 30s) to finish in-flight requests before the container is killed. Without graceful shutdown:

- In-flight HTTP requests get abruptly terminated, causing 502s to clients.
- Database transactions are left in ambiguous states — committed or rolled back is unknown.
- Redis connection pools leak if connections aren't properly closed.

### Pattern

```python
# app/lifecycle.py

import asyncio
import signal
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from ..db import db_pool, init_db_pool, close_db_pool
from ..cache import redis_pool, init_redis_pool, close_redis_pool
from ..logging_config import logger

# Global flag for in-flight request tracking
shutdown_event = asyncio.Event()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan: startup and shutdown hooks."""

    # --- Startup ---
    logger.info("starting_up", extra={"phase": "startup"})
    await init_db_pool()
    await init_redis_pool()
    logger.info("dependencies_ready", extra={"phase": "startup"})

    # Register signal handlers for graceful shutdown
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(
            sig,
            lambda s=sig: asyncio.create_task(_handle_shutdown(s, app)),
        )

    yield

    # --- Shutdown ---
    # If we reach here without signal handler, do clean shutdown
    await _drain_and_cleanup(app)


async def _handle_shutdown(signum: signal.Signals, app: FastAPI) -> None:
    """Signal handler: set flag, then wait for in-flight requests to drain."""
    sig_name = signum.name
    logger.info("shutdown_signal_received", extra={"signal": sig_name})

    # Signal middleware to stop accepting new requests
    shutdown_event.set()

    # Give in-flight requests time to complete
    # uvicorn handles the actual drain; we just clean up resources
    await _drain_and_cleanup(app)


async def _drain_and_cleanup(app: FastAPI) -> None:
    """Close external connections gracefully."""
    logger.info("draining_connections", extra={"phase": "shutdown"})

    # Close pools with timeout — don't hang forever
    try:
        await asyncio.wait_for(close_db_pool(), timeout=10.0)
        logger.info("postgres_pool_closed", extra={"phase": "shutdown"})
    except asyncio.TimeoutError:
        logger.warning("postgres_pool_close_timeout", extra={"phase": "shutdown"})

    try:
        await asyncio.wait_for(close_redis_pool(), timeout=5.0)
        logger.info("redis_pool_closed", extra={"phase": "shutdown"})
    except asyncio.TimeoutError:
        logger.warning("redis_pool_close_timeout", extra={"phase": "shutdown"})

    logger.info("shutdown_complete", extra={"phase": "shutdown"})
```

### Connection Pool Setup

```python
# app/db.py

import asyncpg
from .config import settings

_pool: asyncpg.Pool | None = None


async def init_db_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=20,
        # Close idle connections after 5 minutes
        max_inactive_connection_lifetime=300,
        # Acquire timeout prevents indefinite waits on exhausted pool
        command_timeout=30,
    )


async def close_db_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_db_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool not initialized")
    return _pool


# Convenience alias for dependency injection
db_pool = property(lambda self: get_db_pool())
```

```python
# app/cache.py

import redis.asyncio as aioredis
from .config import settings

_redis: aioredis.Redis | None = None


async def init_redis_pool() -> None:
    global _redis
    _redis = aioredis.from_url(
        settings.redis_url,
        max_connections=20,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
    )


async def close_redis_pool() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


def get_redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("Redis pool not initialized")
    return _redis


redis_pool = property(lambda self: get_redis())
```

### Key Decisions

| Decision | Rationale |
|---|---|
| `asynccontextmanager` lifespan over `on_event` | `@app.on_event("startup")` is deprecated in FastAPI. The lifespan context manager is the supported pattern and gives you a clean yield point between startup and shutdown. |
| `asyncio.wait_for` with timeouts on pool close | If PostgreSQL is unreachable at shutdown, `pool.close()` can hang indefinitely. The timeout ensures the process exits within the Kubernetes grace period. |
| Signal handlers in the event loop | Uvicorn installs its own signal handlers. By registering ours in the lifespan, we ensure our cleanup runs before uvicorn's, so we close connection pools while the server is still draining requests. |
| Separate `shutdown_event` flag | Middleware can check this flag to return 503 for new requests while in-flight ones drain, preventing new work from arriving during shutdown. |

---

## 3. CORS with Explicit Origins

### Why

`allow_origins=["*"]` means any website can make authenticated requests to your API. This is fine for public APIs with no auth, but for an e-commerce backend with session tokens or API keys, wildcard CORS is a credential leak.

Explicit origins enforce that only your frontend domains can call the API. If an attacker hosts a malicious site, the browser will block the cross-origin request before it's sent.

### Pattern

```python
# app/config.py

from pydantic_settings import BaseSettings
from typing import set


class Settings(BaseSettings):
    # ... other settings ...

    # Comma-separated list of allowed origins
    cors_origins: str = ""

    # Environment: "production", "staging", "development"
    environment: str = "development"

    @property
    def cors_origin_set(self) -> set[str]:
        """Parse CORS origins from comma-separated env var."""
        origins = {origin.strip() for origin in self.cors_origins.split(",") if origin.strip()}
        return origins

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
```

```python
# app/middleware/cors.py

from fastapi.middleware.cors import CORSMiddleware
from ..config import settings


def add_cors_middleware(app) -> None:
    origins = list(settings.cors_origin_set)

    # In development, allow localhost variants for convenience
    if settings.environment == "development":
        dev_origins = [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
        origins = list(set(origins) | set(dev_origins))

    if not origins:
        raise ValueError(
            "CORS_ORIGINS must be set in production. "
            "Set the CORS_ORIGINS environment variable to a comma-separated "
            "list of allowed origins (e.g., 'https://shop.example.com,https://admin.example.com')."
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,  # Needed for cookies / Authorization header
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Request-ID",
            "Accept",
            "Origin",
        ],
        max_age=600,  # Preflight cache: 10 minutes
    )
```

### Key Decisions

| Decision | Rationale |
|---|---|
| Explicit origin list from env var | Origins change per environment (dev, staging, prod). Env vars let you deploy the same image to different environments with different CORS policies. |
| Fail-fast if no origins in production | An e-commerce API without CORS origins configured is either misconfigured or intentionally insecure. Better to fail deployment than ship with `*`. |
| `allow_credentials=True` | E-commerce backends almost always need cookies or Authorization headers. Without this, browsers won't send credentials cross-origin. |
| `max_age=600` | Without this, browsers send a preflight OPTIONS request before every cross-origin request. Caching for 10 minutes eliminates redundant preflights. |
| Explicit `allow_headers` list | Wildcard headers with `allow_credentials=True` are rejected by browsers. You must list them explicitly. |

---

## 4. Structured JSON Logging with Request IDs

### Why

In production, logs from multiple instances stream into a centralized system (CloudWatch, Datadog, ELK). Plain text logs are unparseable. Structured JSON logs let you:

- Filter by `request_id` to trace a single request across all services.
- Filter by `correlation_id` to trace a user action across multiple services.
- Set alerts on `level=ERROR` with structured fields rather than regex on text.
- Correlate slow database queries with the HTTP request that triggered them.

### Pattern

```python
# app/logging_config.py

import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

# Context variables — scoped per-request, safe for async
request_id_var: ContextVar[str] = ContextVar("request_id", default="")
correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")


class StructuredFormatter(logging.Formatter):
    """Emits one JSON object per log line."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_var.get(""),
            "correlation_id": correlation_id_var.get(""),
        }

        # Merge any extra fields passed via logger.info("msg", extra={...})
        if hasattr(record, "extra_fields"):
            log_entry.update(record.extra_fields)

        # Attach exception info if present
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


def setup_logging(log_level: str = "INFO") -> None:
    """Configure root logger with structured JSON output."""
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    # Remove any existing handlers (uvicorn adds its own)
    root_logger.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(StructuredFormatter())
    root_logger.addHandler(handler)

    # Quiet down noisy third-party loggers
    for noisy in ("uvicorn.access", "asyncpg", "aioredis"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str = "app") -> logging.Logger:
    return logging.getLogger(name)
```

### Request ID Middleware

```python
# app/middleware/request_id.py

import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ..logging_config import request_id_var, correlation_id_var, get_logger

logger = get_logger(__name__)


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Assigns a unique request_id to every incoming request.
    Propagates correlation_id from upstream services if present.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Generate or propagate request ID
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request_id_var.set(req_id)

        # Propagate correlation ID from upstream (e.g., API gateway)
        corr_id = request.headers.get("X-Correlation-ID", "")
        if corr_id:
            correlation_id_var.set(corr_id)

        logger.info(
            "request_started",
            extra={
                "extra_fields": {
                    "method": request.method,
                    "path": request.url.path,
                    "query": str(request.query_params),
                    "client_ip": request.client.host if request.client else None,
                    "user_agent": request.headers.get("user-agent", ""),
                }
            },
        )

        response = await call_next(request)

        # Expose request ID in response for client-side debugging
        response.headers["X-Request-ID"] = req_id

        logger.info(
            "request_completed",
            extra={
                "extra_fields": {
                    "status_code": response.status_code,
                    "method": request.method,
                    "path": request.url.path,
                }
            },
        )

        return response
```

### Key Decisions

| Decision | Rationale |
|---|---|
| `ContextVar` instead of thread-local | FastAPI is async. `threading.local` doesn't work across `await` points — a coroutine can resume on a different thread. `ContextVar` is the correct mechanism for async context propagation. |
| JSON one-object-per-line | This is the format that CloudWatch Logs, Datadog, and ELK expect. Multi-line JSON breaks log aggregation. |
| `X-Request-ID` header propagation | If an API gateway or load balancer generates a request ID, reuse it. This lets you trace a request across the gateway, your service, and downstream services. |
| `X-Correlation-ID` separate from request ID | A correlation ID ties together a user action that spans multiple requests (e.g., "place order" triggers payment service → inventory service → notification service). Request ID is per-hop; correlation ID is end-to-end. |
| Quiet third-party loggers | `uvicorn.access` logs every request as plain text, which pollutes structured logs. We handle request logging in our middleware instead. |

---

## 5. Global Error Handler

### Why

Without a global error handler, FastAPI returns different response shapes for different error types:

- `HTTPException` → `{"detail": "Not Found"}` (FastAPI default)
- `RequestValidationError` → `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}` (Pydantic)
- Unhandled `Exception` → plain text `Internal Server Error` (Starlette)

This inconsistency means clients can't reliably parse error responses. A global handler normalizes all errors to a single schema.

### Pattern

```python
# app/schemas/errors.py

from pydantic import BaseModel
from typing import Any


class ErrorDetail(BaseModel):
    code: str          # Machine-readable: "VALIDATION_ERROR", "NOT_FOUND", "INTERNAL_ERROR"
    message: str       # Human-readable: "Product with id 'abc' not found"
    field: str | None = None  # For validation errors: the field that failed


class ErrorResponse(BaseModel):
    success: bool = False
    request_id: str
    errors: list[ErrorDetail]
```

```python
# app/middleware/error_handler.py

import traceback
from uuid import uuid4

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..logging_config import request_id_var, get_logger
from ..schemas.errors import ErrorDetail, ErrorResponse

logger = get_logger(__name__)


def register_error_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI app."""

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        """Handle intentional HTTP exceptions (404, 403, etc.)."""
        # Map status codes to error codes
        code_map = {
            400: "BAD_REQUEST",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            405: "METHOD_NOT_ALLOWED",
            409: "CONFLICT",
            422: "VALIDATION_ERROR",
            429: "RATE_LIMITED",
            500: "INTERNAL_ERROR",
            502: "BAD_GATEWAY",
            503: "SERVICE_UNAVAILABLE",
        }

        error_code = code_map.get(exc.status_code, "UNKNOWN_ERROR")

        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                request_id=request_id_var.get(""),
                errors=[
                    ErrorDetail(
                        code=error_code,
                        message=str(exc.detail),
                    )
                ],
            ).model_dump(),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """Handle Pydantic validation errors with field-level detail."""
        errors = []
        for err in exc.errors():
            field_path = ".".join(str(loc) for loc in err.get("loc", []))
            # Skip "body" or "query" prefix in field path
            clean_path = field_path.replace("body.", "").replace("query.", "")
            if clean_path in ("body", "query"):
                clean_path = ""

            errors.append(
                ErrorDetail(
                    code="VALIDATION_ERROR",
                    message=err.get("msg", "Validation error"),
                    field=clean_path or None,
                )
            )

        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=ErrorResponse(
                request_id=request_id_var.get(""),
                errors=errors,
            ).model_dump(),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        """Catch-all for unhandled exceptions. Logs full traceback, returns generic message."""
        # Generate a reference ID for support lookup
        error_ref = str(uuid4())[:8]

        logger.error(
            "unhandled_exception",
            extra={
                "extra_fields": {
                    "error_ref": error_ref,
                    "exception_type": type(exc).__name__,
                    "exception_message": str(exc),
                    "traceback": traceback.format_exc(),
                    "method": request.method,
                    "path": request.url.path,
                }
            },
        )

        # Never expose internal details to the client
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ErrorResponse(
                request_id=request_id_var.get(""),
                errors=[
                    ErrorDetail(
                        code="INTERNAL_ERROR",
                        message=(
                            "An unexpected error occurred. "
                            f"Reference: {error_ref}"
                        ),
                    )
                ],
            ).model_dump(),
        )
```

### Key Decisions

| Decision | Rationale |
|---|---|
| Three separate handlers | `HTTPException`, `RequestValidationError`, and unhandled `Exception` have different information needs. Merging them into one handler makes the logic harder to follow and easier to accidentally leak stack traces. |
| `ErrorDetail.code` is machine-readable | Clients should switch on `code`, not parse `message`. Codes like `VALIDATION_ERROR` are stable across deployments; messages may change. |
| `error_ref` for unhandled exceptions | The reference ID links the client-visible error to the server-side log entry. Support can look up `error_ref` in the log aggregator and find the full traceback. |
| Never expose stack traces to clients | Stack traces reveal internal paths, library versions, and SQL queries. This is an information disclosure vulnerability. |
| `field` in validation errors | Frontend form validation needs to know which field failed. Including `field` lets the UI highlight the right input. |

---

## 6. Wiring It All Together

Here's how all the pieces connect in the application factory:

```python
# app/main.py

from fastapi import FastAPI

from .config import settings
from .lifecycle import lifespan
from .middleware.cors import add_cors_middleware
from .middleware.request_id import RequestIDMiddleware
from .middleware.error_handler import register_error_handlers
from .logging_config import setup_logging
from .api import health, products, orders, users

# Initialize structured logging first — before anything else logs
setup_logging(log_level=settings.log_level)

app = FastAPI(
    title="E-Commerce API",
    version="1.0.0",
    lifespan=lifespan,
    # Disable the default error handlers — we have our own
    exception_handlers=None,
)

# --- Middleware (order matters: outermost first) ---
# Request ID must be outermost so all downstream handlers have the ID
app.add_middleware(RequestIDMiddleware)

# CORS must be before error handler so preflight requests get proper headers
add_cors_middleware(app)

# --- Error handlers ---
register_error_handlers(app)

# --- Routes ---
app.include_router(health.router)
app.include_router(products.router, prefix="/api/v1/products", tags=["products"])
app.include_router(orders.router, prefix="/api/v1/orders", tags=["orders"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
```

### Middleware Ordering

Middleware in FastAPI/Starlette is a stack — the first middleware added is the outermost layer. Request flow:

```
Client Request
  → RequestIDMiddleware (assigns request_id, logs start)
    → CORSMiddleware (adds CORS headers, handles preflight)
      → Error Handler (catches exceptions, returns JSON)
        → Route Handler (your business logic)
          ← Response flows back out
```

If CORS middleware is inside RequestID, preflight OPTIONS requests won't get a request ID in the response header. If error handler is outside CORS, CORS headers won't be added to error responses, causing browser failures.

### Configuration

```bash
# .env.production

DATABASE_URL=postgresql://app:secret@db.internal:5432/ecommerce
REDIS_URL=redis://cache.internal:6379/0

CORS_ORIGINS=https://shop.example.com,https://admin.example.com
ENVIRONMENT=production
LOG_LEVEL=INFO

# Kubernetes will use:
#   GET /healthz → liveness probe
#   GET /readyz  → readiness probe
```

```yaml
# k8s/deployment.yaml (relevant probes)

livenessProbe:
  httpGet:
    path: /healthz
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 15
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /readyz
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3

# Must be >= sum of pool close timeouts (10s postgres + 5s redis + buffer)
terminationGracePeriodSeconds: 30
```

---

## Production Hardening Checklist

Use this as a pre-deployment review:

- [ ] **Health checks**: Separate `/healthz` (liveness, no I/O) and `/readyz` (readiness, checks dependencies)
- [ ] **Graceful shutdown**: Lifespan handler closes PostgreSQL and Redis pools with timeouts; signal handlers set drain flag
- [ ] **CORS**: Explicit origin list from environment variable; fail-fast if empty in production; no wildcards with credentials
- [ ] **Structured logging**: JSON format; `request_id` and `correlation_id` in every log line via `ContextVar`; third-party loggers quieted
- [ ] **Global error handler**: Consistent `ErrorResponse` schema for all error types; machine-readable `code` field; `error_ref` for unhandled exceptions; no stack traces to clients
- [ ] **Middleware order**: Request ID → CORS → Error Handler → Routes
- [ ] **Connection pools**: Bounded pool sizes; acquire timeouts; idle connection reaping
- [ ] **Kubernetes probes**: Liveness and readiness configured with appropriate thresholds; `terminationGracePeriodSeconds` set
- [ ] **Environment config**: All secrets from env vars, not hardcoded; different origins per environment
- [ ] **Log output**: `stdout` only (not files); JSON format; no mixed plain-text lines from third-party libraries