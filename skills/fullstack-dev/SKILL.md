---
name: fullstack-dev
description: >
  Full-stack backend architecture and frontend-backend integration guide.
  TRIGGER when: building a full-stack app, creating REST API with frontend,
  designing service layers, implementing error handling, managing config/auth,
  setting up API clients, implementing auth flows (JWT/session/OAuth),
  connecting frontend to backend, adding real-time features (SSE/WebSocket),
  hardening for production, designing project structure,
  or implementing data layer patterns.
  DO NOT TRIGGER when: fixing a build failure (use build-resolver),
  reviewing existing code (use code-review), or scanning for security
  vulnerabilities (use security-auditor).
compatibility: opencode
license: MIT
metadata:
  version: "1.0.0"
  category: full-stack
---

# Full-Stack Development Practices

## MANDATORY WORKFLOW

**When this skill triggers, follow these steps in order before writing any code.**

### Step 0: Gather Requirements

Infer from the user's request (or ask if unclear):

1. **Stack**: Language/framework for backend and frontend
2. **Service type**: API-only, full-stack monolith, or microservice?
3. **Database**: SQL (PostgreSQL, SQLite, MySQL) or NoSQL (MongoDB, Redis)?
4. **Integration**: REST, GraphQL, tRPC, or gRPC?
5. **Real-time**: Needed? If yes — SSE, WebSocket, or polling?
6. **Auth**: Needed? If yes — JWT, session, OAuth, or third-party (Clerk, Auth.js)?

### Step 1: Make Architectural Decisions

State **ALL 7 decisions** explicitly before coding. Every dimension must be addressed — if one does not apply (e.g., no real-time needed), state "Not applicable" with a brief reason. Do not skip rows.

| Decision | Options | Reference |
|----------|---------|-----------|
| Project structure | Feature-first (recommended) vs layer-first | [Section 1](#1-project-structure--layering) |
| API client approach | Typed fetch / React Query / tRPC / OpenAPI codegen | [Section 4](#4-api-client-patterns) |
| Auth strategy | JWT + refresh / session / third-party | [Section 5](#5-authentication--middleware) |
| Middleware order | Standard chain: RequestID → Logging → CORS → RateLimit → BodyParse → Auth → Authz → Validation → Handler → ErrorHandler | [Section 6](#6-authentication--middleware) |
| Real-time method | Polling / SSE / WebSocket | [Section 9](#9-real-time-patterns) |
| Error handling | Typed error hierarchy + global handler | [Section 3](#3-error-handling--resilience) |
| Language rules | Check if rules exist for your stack; if not, follow [Capability Boundary](#capability-boundary-unknown-stacks) protocol | [Core Principles](#core-principles-7-iron-rules) |

Explain each choice briefly (1 sentence per decision).

**Language rules gate:** Before coding, explicitly check whether language-specific rules exist for your stack. State the result: "Language rules found for [stack]" or "No language rules for [stack] — applying Capability Boundary protocol." If none exist, invoke the Capability Boundary protocol (state it, apply all patterns, reference external guides).

**API client and middleware order** must always be addressed even in backend-only projects — the middleware chain belongs to the backend, and the API client choice tells the consumer how to integrate.

### Step 2: Scaffold with Checklist

Choose the matching checklist from [Quick Start Checklists](#quick-start-checklists). State which checklist you are using ("New Backend Service Checklist" or "Frontend-Backend Integration Checklist") and reference specific checklist items by name as you implement them. Ensure ALL checked items are accounted for — either implemented or explicitly noted as deferred with a reason.

### Step 3: Implement Following Patterns

Write code following the patterns in this document. For each major implementation block, cite the specific skill section it follows (e.g., "Per Section 1: Feature-First Organization" before showing the directory tree, or "Per Section 3: Typed Error Hierarchy" before error classes). Every code block or structural decision must trace back to the skill section that defines it.

### Step 4: Verify

After implementation, run these checks. For each check, provide an explicit **pass/fail resolution statement** — do not leave the result implicit.

1. **Build check**: Both backend and frontend compile without errors
2. **Smoke test**: Start the server, verify key endpoints return expected responses
3. **Integration check**: Verify frontend can connect to backend (CORS, API URL, auth flow)
4. **Real-time check** (if applicable): Open two tabs, verify changes sync

State the outcome for each check (e.g., "Build check: ✅ passed — zero errors"). Then provide a concluding handoff decision:

- **All checks passed** → "All checks passed. No handoff needed."
- **Any check failed** → "Check [X] failed. Handing off to `build-resolver` for diagnosis." Include what the failure was and any available error output.

### Step 5: Handoff Summary

Provide:
- **What was built**: Implemented features and endpoints
- **How to run**: Exact commands to start backend and frontend
- **What's missing / next steps**: Deferred items, known limitations
- **Key files**: Most important files the user should know about

---

## Scope

**USE this skill when:**
- Building a full-stack application (backend + frontend)
- Scaffolding a new backend service or API
- Designing project structure and module boundaries
- Implementing database access, caching, or background jobs
- Writing error handling, logging, or configuration management
- Setting up API clients, auth flows, file uploads, or real-time features
- Hardening for production

**DO NOT use this skill for:**
- **Build failure diagnosis** — use `build-resolver` (reactive triage of broken builds)
- **Code quality audit** — use `code-review` (evaluates existing code for correctness, security, performance)
- **Security vulnerability scanning** — use `security-auditor` (pre-deployment static analysis)
- **Pure frontend/UI concerns** — use `frontend-ui-ux` (design engineering and aesthetics)
- **Pure database schema design** without backend context

### Scope Refusal Protocol

When a request clearly falls into a "DO NOT use this skill for" category, follow these steps:

1. **State the boundary**: "This task is outside the scope of fullstack-dev. It is a **[category]** task."
2. **Redirect**: "The [skill-name] skill is designed for this — switch to that skill for proper handling."
3. **Stop**: Do NOT offer preliminary diagnosis, partial fixes, or "getting started" steps. Zero assistance on the out-of-scope task.

This is a boundary enforcement rule, not a suggestion. The skill explicitly excludes these domains — redirecting protects the user from incomplete or inappropriate guidance.

---

## Quick Start Checklists

### New Backend Service Checklist

- [ ] Project scaffolded with **feature-first** structure
- [ ] Configuration **centralized**, env vars **validated at startup** (fail fast)
- [ ] **Typed error hierarchy** defined (not generic `Error`)
- [ ] **Global error handler** middleware
- [ ] **Structured JSON logging** with request ID propagation
- [ ] Database: **migrations** set up, **connection pooling** configured
- [ ] **Input validation** on all endpoints
- [ ] **Authentication middleware** in place
- [ ] **Health check** endpoints (`/health`, `/ready`)
- [ ] **Graceful shutdown** handling (SIGTERM)
- [ ] **CORS** configured (explicit origins, not `*`)
- [ ] **Security headers** (helmet or equivalent)
- [ ] `.env.example` committed (no real secrets)

### Frontend-Backend Integration Checklist

- [ ] **API client** configured (typed fetch wrapper, React Query, tRPC, or OpenAPI generated)
- [ ] **Base URL** from environment variable (not hardcoded)
- [ ] **Auth token** attached to requests automatically (interceptor / middleware)
- [ ] **Error handling** — API errors mapped to user-facing messages
- [ ] **Loading states** handled (skeleton/spinner, not blank screen)
- [ ] **Type safety** across the boundary (shared types, OpenAPI, or tRPC)
- [ ] **CORS** configured with explicit origins (not `*` in production)
- [ ] **Refresh token** flow implemented (httpOnly cookie + transparent retry on 401)

---

## Navigation

| Need to… | Jump to |
|----------|---------|
| Organize project folders | [Section 1](#1-project-structure--layering) |
| Manage config + secrets | [Section 2](#2-configuration--environment) |
| Handle errors properly | [Section 3](#3-error-handling--resilience) |
| Write database code | [Section 4](#4-database-access-patterns) |
| Set up API client from frontend | [Section 5](#5-api-client-patterns) |
| Add auth middleware | [Section 6](#6-authentication--middleware) |
| Set up logging | [Section 7](#7-logging--observability) |
| Add background jobs | [Section 8](#8-background-jobs) |
| Add real-time features (SSE, WebSocket) | [Section 9](#9-real-time-patterns) |
| Handle API errors in frontend UI | [Section 10](#10-cross-boundary-error-handling) |
| Harden for production | [Section 11](#11-production-hardening) |
| Implement caching | [Section 12](#12-caching-patterns) |
| Upload files | [Section 13](#13-file-upload-patterns) |

---

## Core Principles (8 Iron Rules)

```
1. ✅ Organize by FEATURE, not by technical layer
2. ✅ Controllers never contain business logic
3. ✅ Services never import HTTP request/response types
4. ✅ All config from env vars, validated at startup, fail fast
5. ✅ Every error is typed, logged, and returns consistent format
6. ✅ All input validated at the boundary — trust nothing from client
7. ✅ Structured JSON logging with request ID — not console.log
8. ✅ Maintain discipline on every project — even trivial APIs get typed errors, structured logging, and proper layering. "It's small" is not an excuse for shortcuts.
```

For **language-level syntax and style rules**, see:
- `rules/languages/typescript.md` — TypeScript naming, strict mode, async patterns
- `rules/languages/python.md` — Python naming, type annotations, error handling
- `rules/concerns/project-structure.md` — Basic directory layouts
- `rules/concerns/testing.md` — AAA pattern, mock philosophy, coverage
- `rules/concerns/documentation.md` — Docstring conventions

### Capability Boundary: Unknown Stacks

This skill defines **language-agnostic architecture patterns** (feature-first layering, error hierarchies, config management, auth flows). These patterns apply regardless of language or framework.

**No language-specific rules exist for languages beyond those listed above.** If you are working with a language or framework not covered by the referenced rules files (e.g., Rust, Go, Swift, Kotlin, Elixir), follow this protocol:

1. **State explicitly** at the start of your response: "This project uses \[language/framework\]. No language-specific rules exist in this system for \[language\]. I will apply the fullstack-dev architecture patterns and reference external style guides for language conventions."
2. **Apply all Core Principles** — they are language-agnostic and every stack benefits from them.
3. **Reference external sources** for language-specific conventions:
   - Rust: [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/), [Rust Style Guide](https://doc.rust-lang.org/style-guide/)
   - Go: [Go Code Review Comments](https://go.dev/wiki/CodeReviewComments), [Effective Go](https://go.dev/doc/effective_go)
   - General: Consult the official language style guide and community standards.
4. **Do not bail out** — the architecture patterns (typed errors, three-layer separation, structured logging, etc.) are platform-independent and always applicable.

---

## 1. Project Structure & Layering

### Feature-First Organization

```
✅ Feature-first                    ❌ Layer-first
src/                                src/
  orders/                             controllers/
    order.controller.ts                 order.controller.ts
    order.service.ts                    user.controller.ts
    order.repository.ts               services/
    order.dto.ts                        order.service.ts
    order.test.ts                       user.service.ts
  users/                              repositories/
    user.controller.ts                  ...
    user.service.ts
  shared/
    database/
    middleware/
```

### Three-Layer Architecture

```
Controller (HTTP) → Service (Business Logic) → Repository (Data Access)
```

| Layer | Responsibility | Never |
|-------|---------------|-------|
| Controller | Parse request, validate, call service, format response | Business logic, DB queries |
| Service | Business rules, orchestration, transaction management | HTTP types (req/res), direct DB |
| Repository | Database queries, external API calls | Business logic, HTTP types |

### Dependency Injection

Inject dependencies through constructors — never instantiate dependencies inside a class.

**TypeScript:**
```typescript
class OrderService {
  constructor(
    private readonly orderRepo: OrderRepository,    // injected interface
    private readonly emailService: EmailService,
  ) {}
}
```

**Python:**
```python
class OrderService:
    def __init__(self, order_repo: OrderRepository, email_service: EmailService):
        self.order_repo = order_repo                 # injected
        self.email_service = email_service
```

---

## 2. Configuration & Environment

### Centralized, Typed, Fail-Fast

All configuration flows through a single typed config object. Validate required env vars at startup — fail fast, not at first use.

**TypeScript:**
```typescript
const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    url: requiredEnv('DATABASE_URL'),
    poolSize: intEnv('DB_POOL_SIZE', 10),
  },
  auth: {
    jwtSecret: requiredEnv('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
} as const;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
```

**Python (Pydantic):**
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str                        # required — app won't start without
    jwt_secret: str                          # required
    port: int = 3000                         # optional with default
    db_pool_size: int = 10

    class Config:
        env_file = ".env"

settings = Settings()  # fails fast if DATABASE_URL missing
```

### Rules

```
✅ All config via environment variables (Twelve-Factor)
✅ Validate required vars at startup — fail fast
✅ Type-cast at the config layer, not at usage sites
✅ Commit .env.example with dummy values

❌ Never hardcode secrets, URLs, or credentials
❌ Never commit .env files
❌ Never scatter process.env / os.environ throughout code
```

---

## 3. Error Handling & Resilience

### Typed Error Hierarchy

Build a domain-specific error hierarchy so every error carries a machine-readable code and HTTP status.

**TypeScript:**
```typescript
class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly isOperational: boolean = true,
  ) { super(message); }
}

class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
  }
}

class ValidationError extends AppError {
  constructor(public readonly errors: FieldError[]) {
    super('Validation failed', 'VALIDATION_ERROR', 422);
  }
}
```

**Python:**
```python
class AppError(Exception):
    def __init__(self, message: str, code: str, status_code: int):
        self.message, self.code, self.status_code = message, code, status_code

class NotFoundError(AppError):
    def __init__(self, resource: str, id: str):
        super().__init__(f"{resource} not found: {id}", "NOT_FOUND", 404)
```

### Global Error Handler

A single middleware catches all errors and returns a consistent JSON shape:

```typescript
app.use((err, req, res, next) => {
  if (err instanceof AppError && err.isOperational) {
    logger.warn('Operational error', { code: err.code, detail: err.message, requestId: req.id });
    return res.status(err.statusCode).json({
      error: err.code,
      status: err.statusCode,
      detail: err.message,
      requestId: req.id,
    });
  }
  // Programming error — log full stack, return generic 500
  logger.error('Unexpected error', { error: err.message, stack: err.stack, requestId: req.id });
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    status: 500,
    requestId: req.id,
  });
});
```

### Rules

```
✅ Typed, domain-specific error classes
✅ Global error handler catches everything
✅ Operational errors → structured response with error code
✅ Programming errors → log + generic 500 (no stack leaks)
✅ Retry transient failures with exponential backoff

❌ Never catch and ignore errors silently
❌ Never return stack traces to client
❌ Never throw generic Error('something')
❌ Never use error codes in client-facing messages — map to user text at the boundary
```

> **Even for trivial APIs:** A typed error hierarchy and global handler seem like overhead for a 3-endpoint service. They are not. They save time on the first integration (consistent error shape) and prevent production incidents (no unhandled exceptions reaching the client). The cost is ~15 lines of error classes + 10 lines of middleware — negligible. **Do not skip.** The same applies to structured logging and input validation: these patterns pay for themselves on the first deployment.

---

## 4. Database Access Patterns

### Migrations Always

```
✅ Schema changes via migrations, never manual SQL
✅ Migrations must be reversible (down migration)
✅ Review migration SQL before production
❌ Never modify production schema manually
```

### N+1 Prevention

```typescript
// ❌ N+1: 1 query + N queries
const orders = await db.order.findMany();
for (const o of orders) {
  o.items = await db.item.findMany({ where: { orderId: o.id } });
}

// ✅ Single JOIN or include query
const orders = await db.order.findMany({ include: { items: true } });
```

### Transactions for Multi-Step Writes

```typescript
await db.$transaction(async (tx) => {
  const order = await tx.order.create({ data: orderData });
  await tx.inventory.decrement({ productId, quantity });
  await tx.payment.create({ orderId: order.id, amount });
});
```

### Connection Pooling

Start with `(CPU cores × 2) + spindle_count` (typically 10-20). Always set connection timeout and max lifetime. Use PgBouncer for serverless environments.

---

## 5. API Client Patterns

The "glue layer" between frontend and backend. Choose the approach that fits your team and stack.

### Option A: Typed Fetch Wrapper (Simple, No Dependencies)

```typescript
// lib/api-client.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(body?.detail || body?.message || `API error ${status}`);
  }
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();  // from cookie / memory / context
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const apiClient = {
  get: <T>(path: string) => api<T>(path),
  post: <T>(path: string, data: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: <T>(path: string) => api<T>(path, { method: 'DELETE' }),
};
```

### Option B: React Query + Typed Client (Recommended for React)

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: () => apiClient.get<{ data: Order[] }>('/api/orders'),
    staleTime: 1000 * 60,  // 1 min
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrderInput) =>
      apiClient.post<{ data: Order }>('/api/orders', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  });
}
```

### Option C: tRPC (End-to-End Type Safety, Same Team)

Both sides TypeScript → fully typed, zero code generation.

### Option D: OpenAPI Generated (Public / Multi-Consumer APIs)

```bash
npx openapi-typescript-codegen \
  --input http://localhost:3001/api/openapi.json \
  --output src/generated/api \
  --client axios
```

### Decision Matrix

| Approach | When | Type Safety | Effort |
|----------|------|-------------|--------|
| Typed fetch wrapper | Simple apps, small teams | Manual types | Low |
| React Query + fetch | React apps, server state | Manual types | Medium |
| tRPC | Same team, TS both sides | Automatic | Low |
| OpenAPI generated | Public API, multi-consumer | Automatic | Medium |
| GraphQL codegen | GraphQL APIs | Automatic | Medium |

---

## 6. Authentication & Middleware

### Standard Middleware Order

```
Request → 1.RequestID → 2.Logging → 3.CORS → 4.RateLimit → 5.BodyParse
       → 6.Auth → 7.Authz → 8.Validation → 9.Handler → 10.ErrorHandler → Response
```

### JWT Rules

```
✅ Short expiry access token (15min) + refresh token (server-stored)
✅ Minimal claims: userId, roles (not entire user object)
✅ Rotate signing keys periodically

❌ Never store tokens in localStorage (XSS risk)
❌ Never pass tokens in URL query params
```

### RBAC Pattern

```typescript
function authorize(...roles: Role[]) {
  return (req, res, next) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.some(r => req.user.roles.includes(r))) throw new ForbiddenError();
    next();
  };
}
router.delete('/users/:id', authenticate, authorize('admin'), deleteUser);
```

### Token Refresh (Transparent)

```typescript
// Frontend: auto-retry on 401 with refresh
async function apiWithRefresh<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return await api<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const refreshed = await api<{ accessToken: string }>('/api/auth/refresh', {
        method: 'POST', credentials: 'include',  // send httpOnly cookie
      });
      setAuthToken(refreshed.accessToken);
      return api<T>(path, options);  // retry original request
    }
    throw err;
  }
}
```

---

## 7. Logging & Observability

### Structured JSON Logging

```typescript
// ✅ Structured — parseable, filterable, alertable
logger.info('Order created', {
  orderId: order.id, userId: user.id, total: order.total,
  items: order.items.length, durationMs: Date.now() - startTime,
});

// ❌ Unstructured — useless at scale
console.log(`Order created for user ${user.id}`);
```

### Log Levels

| Level | When | Production |
|-------|------|------------|
| error | Requires immediate attention | ✅ Always |
| warn | Unexpected but handled | ✅ Always |
| info | Normal operations, audit trail | ✅ Always |
| debug | Dev troubleshooting | ❌ Dev only |

### Rules

```
✅ Request ID in every log entry (propagated via middleware)
✅ Log at layer boundaries (request in, response out, external call)
❌ Never log passwords, tokens, PII, or secrets
❌ Never use console.log in production code
```

---

## 8. Background Jobs

### Rules

```
✅ All jobs must be IDEMPOTENT (same job twice = same result)
✅ Failed jobs → retry (max 3) → dead letter queue → alert
✅ Workers run as SEPARATE processes (not threads in API server)

❌ Never put long-running tasks in request handlers
❌ Never assume a job runs exactly once
```

### Idempotent Job Pattern

```typescript
async function processPayment(data: { orderId: string }) {
  const order = await orderRepo.findById(data.orderId);
  if (order.paymentStatus === 'completed') return;  // already processed
  await paymentGateway.charge(order);
  await orderRepo.updatePaymentStatus(order.id, 'completed');
}
```

---

## 9. Real-Time Patterns

### Option A: SSE — Server → Client (One-Way)

Best for: notifications, live feeds, streaming AI responses.

**Frontend:**
```typescript
function useServerEvents(userId: string) {
  useEffect(() => {
    const source = new EventSource(`/api/events?userId=${userId}`);
    source.addEventListener('notification', (e) => {
      showToast(JSON.parse(e.data).message);
    });
    source.onerror = () => {
      source.close();
      setTimeout(() => { /* reconnect logic */ }, 3000);
    };
    return () => source.close();
  }, [userId]);
}
```

### Option B: WebSocket — Bidirectional

Best for: chat, collaborative editing, gaming.

### Option C: Polling — Simplest, No Infrastructure

```typescript
function useOrderStatus(orderId: string) {
  return useQuery({
    queryKey: ['order-status', orderId],
    queryFn: () => apiClient.get<Order>(`/api/orders/${orderId}`),
    refetchInterval: (query) => {
      if (query.state.data?.status === 'completed') return false;
      return 5000;  // poll every 5s until done
    },
  });
}
```

### Decision Matrix

| Method | Direction | Complexity | When |
|--------|-----------|------------|------|
| Polling | Client → Server | Low | Simple status checks, < 10 clients |
| SSE | Server → Client | Medium | Notifications, feeds, AI streaming |
| WebSocket | Bidirectional | High | Chat, collaboration, gaming |

---

## 10. Cross-Boundary Error Handling

### API Error → User-Facing Message

Every API error code must map to a human-readable message at the UI layer:

```typescript
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401: return 'Please log in to continue.';
      case 403: return "You don't have permission to do this.";
      case 404: return "The item you're looking for doesn't exist.";
      case 409: return 'This conflicts with an existing item.';
      case 422: {
        const fields = error.body?.errors;
        if (fields?.length) return fields.map((f: any) => f.message).join('. ');
        return 'Please check your input.';
      }
      case 429: return 'Too many requests. Please wait a moment.';
      default: return 'Something went wrong. Please try again.';
    }
  }
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'Cannot connect to server. Check your internet connection.';
  }
  return 'An unexpected error occurred.';
}
```

### Rules

```
✅ Map every API error code to a human-readable message
✅ Show field-level validation errors next to form inputs
✅ Auto-retry on 5xx (max 3, with backoff), never on 4xx
✅ Redirect to login on 401 (after refresh attempt fails)
✅ Show "offline" banner when fetch fails with TypeError

❌ Never show raw API error messages to users
❌ Never silently swallow errors (show toast or log)
❌ Never retry 4xx errors (client is wrong, retrying won't help)
```

---

## 11. Production Hardening

### Health Checks

```typescript
app.get('/health', (req, res) => res.json({ status: 'ok' }));            // liveness
app.get('/ready', async (req, res) => {                                    // readiness
  const checks = {
    database: await checkDb(),
    redis: await checkRedis(),
  };
  const ok = Object.values(checks).every(c => c.status === 'ok');
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
});
```

### Graceful Shutdown

```typescript
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  server.close();              // stop accepting new connections
  await drainConnections();    // finish in-flight requests
  await closeDatabase();
  process.exit(0);
});
```

### Security Hardening Checklist

```
✅ CORS: explicit origins (never '*' in production)
✅ Security headers (helmet / helmet-like middleware)
✅ Rate limiting on public endpoints
✅ Input validation on ALL endpoints (trust nothing)
✅ HTTPS enforced in production
✅ Proper secrets management (no hardcoded keys)
❌ Never expose internal errors to clients
```

---

## 12. Caching Patterns

### Cache-Aside (Lazy Loading)

```typescript
async function getUser(id: string): Promise<User> {
  const cached = await redis.get(`user:${id}`);
  if (cached) return JSON.parse(cached);
  const user = await userRepo.findById(id);
  if (!user) throw new NotFoundError('User', id);
  await redis.set(`user:${id}`, JSON.stringify(user), 'EX', 900);
  return user;
}
```

### Rules

```
✅ ALWAYS set TTL — never cache without expiry
✅ Invalidate on write (delete cache key on update)
✅ Use cache for reads, never for authoritative state

❌ Never cache without TTL (stale data > slow data)
```

---

## 13. File Upload Patterns

| Method | File Size | Server Load | Complexity |
|--------|-----------|-------------|------------|
| Presigned URL | Any (recommended > 5MB) | None (direct to storage) | Medium |
| Multipart | < 10MB | High (streams through server) | Low |
| Chunked / Resumable | > 100MB | Medium | High |

**Prefer presigned URLs** (direct-to-S3) for anything over 5MB — saves your server from buffering large files.

---

## Anti-Patterns

| # | ❌ Don't | ✅ Do Instead | Reason |
|---|----------|--------------|--------|
| 1 | Business logic in routes/controllers | Move to service layer | Testability, separation of concerns |
| 2 | `process.env` scattered everywhere | Centralized typed config | Discoverability, fail-fast validation |
| 3 | `console.log` for logging | Structured JSON logger | Observability, search, alerting |
| 4 | Generic `Error('oops')` | Typed error hierarchy | Machine-readable error handling |
| 5 | Direct DB calls in controllers | Repository pattern | Swap DB without touching business logic |
| 6 | No input validation | Validate at boundary (Zod/Pydantic) | Security, data integrity |
| 7 | Catching and ignoring errors | Log + rethrow or propagate | Silent failures = production incidents |
| 8 | No health check endpoints | `/health` + `/ready` | Orchestrators need liveness/readiness probes |
| 9 | Hardcoded config/secrets | Environment variables | Security, environment portability |
| 10 | No graceful shutdown | Handle SIGTERM properly | Data loss prevention |
| 11 | Store JWT in localStorage | Memory + httpOnly refresh cookie | XSS protection |
| 12 | Show raw API errors to users | Map to human-readable messages | UX, information hiding |
| 13 | Duplicate types frontend + backend | Shared types, tRPC, or OpenAPI codegen | Single source of truth |
| 14 | Upload large files through API server | Presigned URL → direct to S3 | Server resource preservation |
| 15 | Poll when real-time needed | SSE or WebSocket | Network efficiency, latency |

---

## When Things Still Break

This skill provides patterns for **building** robust fullstack applications. If the build fails, tests don't pass, or you encounter errors:

1. **Build/test failures** → use `build-resolver` (structured triage: dependency, code drift, config drift, external)
2. **Code quality concerns** → use `code-review` (correctness, security, performance, maintainability audit)
3. **Pre-deployment security** → use `security-auditor` (secrets, injection, XSS, auth/CSRF, deps, path traversal)
4. **UI/UX design validation** → use `ui-auditor` (CSS architecture, accessibility, performance budget)
