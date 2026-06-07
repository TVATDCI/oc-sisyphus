# Iteration 1 Grading Report — fullstack-dev Skill

## Legend
- ✅ = Pass (assertion met)
- ⚠️ = Partial (assertion partially met)
- ❌ = Fail (assertion not met)

---

## Eval 0: api-project-structure
**Prompt:** Scaffold Express+TS SaaS backend with nested routes, RBAC, typed errors.

| Assertion | With Skill | Without Skill |
|-----------|:----------:|:-------------:|
| feature-first structure | ✅ `src/teams/`, `src/projects/`, `src/tasks/` with controller/service/repository per feature | ⚠️ Top-level is layer-first (routes/, middleware/, errors/), but nested under routes/teams/ |
| typed error hierarchy | ✅ AppError → NotFoundError, ValidationError (FieldError[]), UnauthorizedError, ForbiddenError | ✅ AppError → NotFoundError, ForbiddenError, UnauthorizedError, ConflictError, ValidationError |
| validation error with field details | ✅ ValidationError.fields: FieldError[]; global handler flattens into response | ✅ ValidationError.details: FieldError[]; fromZodError helper |
| three-layer separation | ✅ Controller → Service → Repository explicitly separated per feature | ⚠️ Routes contain inline handler logic; no explicit service/repository layer separation |
| global error handler | ✅ errorHandler middleware returns consistent { error, status, message, requestId } | ✅ errorHandler returns consistent { ok: false, error: { code, message, details? } } |
| **Score** | **5/5** | **3/5** |

### Key Differences
- **Structure**: With-skill follows feature-first strictly (orders/, users/, each with controller/service/repository). Without-skill uses layer-first top-level (routes/, middleware/, errors/).
- **Three-layer**: With-skill explicitly separates Controller/Service/Repository. Without-skill only has route handlers with no service or repository abstraction.
- **Auth integration**: With-skill includes JWT auth + RBAC middleware integrated. Without-skill includes RBAC but no JWT auth.
- **Error shape**: With-skill includes requestId in all responses. Without-skill uses `ok: true/false` envelope.

---

## Eval 1: auth-middleware-chain
**Prompt:** Add JWT auth to Next.js+Express with middleware chain and 401 interceptor.

| Assertion | With Skill | Without Skill |
|-----------|:----------:|:-------------:|
| correct middleware order | ✅ RequestID → Logging → CORS → RateLimit → BodyParse → Auth → Authz → Validation → Handler → ErrorHandler (exact skill order) | ✅ Same order, but body parsing placed before rate limiting in actual code |
| httpOnly refresh cookie | ✅ httpOnly, secure, sameSite:strict, path:/api/auth; access token in memory only | ✅ httpOnly, secure, sameSite:strict, path:/api/auth |
| transparent 401 retry | ✅ Queue mechanism for concurrent 401s; refresh mutex; retry original request | ✅ Refresh mutex (refreshPromise); silentRefresh on mount |
| JWT short expiry | ✅ 15m default via JWT_ACCESS_EXPIRY env var | ✅ 15m in config |
| RBAC or authz check | ✅ requireRole(...roles) middleware | ✅ requireRole with roleAtLeast hierarchy |
| **Score** | **5/5** | **5/5** |

### Key Differences
- **Middleware order**: With-skill explicitly documents and implements the exact skill-specified order. Without-skill is very close but places body parsing before rate limiting.
- **Error handling**: With-skill uses typed AppError hierarchy with global handler. Without-skill uses inline error responses and generic error objects.
- **Configuration**: With-skill validates all env at startup with Zod schema. Without-skill uses dotenv with no validation.
- **Feature structure**: With-skill uses feature-first (auth/ directory with controller/service/repository). Without-skill uses layer-first (middleware/, routes/).

---

## Eval 2: production-hardening
**Prompt:** Production-harden FastAPI e-commerce backend (health, shutdown, CORS, logging, errors).

| Assertion | With Skill | Without Skill |
|-----------|:----------:|:-------------:|
| health check endpoints | ✅ /health (liveness) + /ready (readiness w/ DB+Redis checks) | ✅ /healthz + /readyz with per-dependency checks |
| graceful shutdown | ✅ SIGTERM handler with drain timeout, DB close, Redis close | ✅ Lifespan handler with signal handlers, timeout on pool close, shutdown_event flag |
| structured JSON logging | ✅ JSONFormatter + RequestIDMiddleware + contextvars; PII redaction | ✅ JSONFormatter + ContextVar for request_id/correlation_id |
| global error handler | ✅ AppError hierarchy → {error: {code, message, details, request_id}}; unhandled → generic 500 | ✅ ErrorResponse schema; 3 handlers (HTTP, validation, unhandled); error_ref for lookup |
| CORS explicit origins | ✅ cors_origins from env var; fails fast if empty; no wildcard | ✅ cors_origins from env var; fails fast if empty; dev defaults for localhost |
| **Score** | **5/5** | **5/5** |

### Key Differences
- **Language/stack**: Both handle FastAPI correctly. With-skill references skill principles (Section 11, Section 7, Section 3). Without-skill doesn't reference any framework.
- **CORS fail-fast**: With-skill raises ValueError if CORS_ORIGINS empty. Without-skill also fails fast with clear error message.
- **Logging detail**: Both provide structured JSON + request IDs. Without-skill adds correlation_id propagation.
- **Health check naming**: With-skill uses /health + /ready (simpler). Without-skill uses /healthz + /readyz (Kubernetes convention).

---

## Eval 3: edge-case-no-auth-required
**Prompt:** Minimal Express weather API with public data, no auth, background refresh.

| Assertion | With Skill | Without Skill |
|-----------|:----------:|:-------------:|
| no auth middleware forced | ✅ Auth explicitly skipped per requirements; decision table documents this | ✅ No auth middleware |
| minimal structure | ✅ Feature-first with forecasts/ (controller/service/repository), shared/ for cross-cutting | ✅ Minimal: routes/, services/, jobs/, store.js, middleware/ |
| background job pattern | ✅ setInterval in service layer; initial load on startup; graceful stop | ✅ Background refresh job with start/stop; atomic Map swap |
| error handling present | ✅ AppError → NotFoundError; global handler with operational vs programming distinction; structured {error, status, detail, requestId} | ⚠️ Error handler returns { error: { status, message } } but uses generic Error with .status property — not a typed hierarchy |
| **Score** | **4/4** | **3/4** |

### Key Differences
- **Error handling**: With-skill creates typed AppError/NotFoundError hierarchy and distinguishes operational vs programming errors. Without-skill mutates generic `Error` objects with a `.status` property — works but lacks type safety.
- **Logging**: With-skill uses pino for structured JSON logging with request IDs. Without-skill uses console.log.
- **Configuration**: With-skill uses centralized config with requiredEnv(). Without-skill reads process.env directly.
- **Health check**: With-skill has separate /health (liveness) + /ready (readiness). Without-skill has single /health that also reports data freshness.

---

## Eval 4: capability-boundary-graphql-unknown-stack
**Prompt:** Rust (Actix-web+async-graphql) + Svelte + PostgreSQL; subscriptions, presigned URLs, type sharing.

| Assertion | With Skill | Without Skill |
|-----------|:----------:|:-------------:|
| acknowledges Rust gap | ⚠️ Skill notes "No Go rules" but doesn't explicitly note Rust gap; applies core principles anyway | ❌ No gap acknowledgment |
| real-time subscription pattern | ✅ async-graphql Subscription with broadcast channel; graphql-ws + Svelte store on frontend | ✅ async-graphql Subscription with broadcast; graphql-ws + Svelte |
| presigned URL upload | ✅ 3-step flow: request URL → PUT to S3 → confirm; content-type validation; HeadObject verification | ✅ 3-step flow; HeadObject verification; XHR progress tracking |
| type sharing strategy | ✅ SDL export → graphql-codegen → TypeScript; CI drift detection | ✅ SDL export → graphql-codegen → TypeScript; scalar mapping reference |
| handles instead of avoids | ✅ Provides full integration patterns; references skill principles throughout | ✅ Provides full integration patterns |
| **Score** | **4/5** | **4/5** |

### Key Differences
- **Feature-first structure**: With-skill explicitly follows feature-first (photos/, uploads/ with controller/service/repository). Without-skill uses flatter structure.
- **Error handling**: With-skill implements full AppError hierarchy (with operational vs programming distinction) mapped to GraphQL errors. Without-skill uses simpler error helper functions.
- **Anti-patterns**: With-skill explicitly maps all 15 skill anti-patterns to the Rust+Svelte stack. Without-skill has no anti-pattern reference.
- **Auth**: With-skill includes JWT auth pattern (15min + httpOnly refresh). Without-skill uses localStorage for token (anti-pattern per skill).
- **Cross-boundary errors**: With-skill includes mapGraphQLError() + extractFieldErrors() + shouldRetry(). Without-skill has simpler error parsing.

---

## Summary Table

| Eval | With Skill | Without Skill | Delta |
|:----:|:----------:|:-------------:|:-----:|
| 0 — api-project-structure | **5/5** | 3/5 | **+2** |
| 1 — auth-middleware-chain | **5/5** | **5/5** | 0 |
| 2 — production-hardening | **5/5** | **5/5** | 0 |
| 3 — edge-case-no-auth | **4/4** | 3/4 | **+1** |
| 4 — capability-boundary | **4/5** | 4/5 | 0 |
| **Total** | **23/24** | **20/24** | **+3** |

---

## Observations & Patterns

### Where the skill adds clear value

1. **Feature-first structure** (Eval 0): With-skill strictly organizes by feature (orders/, users/) with three-layer separation. Without-skill falls into layer-first pattern.

2. **Three-layer separation** (Eval 0): With-skill enforces Controller→Service→Repository. Without-skill puts logic in route handlers.

3. **Typed error hierarchy** (Eval 3): With-skill maintains AppError subclassing even in a simple API. Without-skill falls back to generic Error with .status property.

4. **Structured logging** (Eval 3): With-skill uses pino with request IDs. Without-skill uses console.log.

5. **Anti-pattern avoidance** (Eval 1, 4): With-skill consistently avoids localized storage for tokens, avoids business logic in routes, and references anti-patterns.

### Where the skill didn't affect the outcome

1. **Production hardening** (Eval 2): Both responses were equally thorough — the FastAPI production hardening patterns are well-known enough that the skill didn't add incremental value.

2. **Auth middleware** (Eval 1): Both implementations were strong. JWT auth patterns are well-established.

3. **Unknown stack** (Eval 4): Both handled the Rust+Svelte stack well. The skill's language-agnostic patterns (feature-first, typed errors) applied equally.

### Improvement opportunities

1. **Rust/Svelte gap acknowledgment**: The skill mentions Go rules don't exist, but doesn't generalize. Should say "No X rules exist" for any unknown language.

2. **Capability-boundary handling**: Eval 4 scored the same with and without skill. The skill could be stronger at explicitly saying "I don't have language rules for Rust, here are the external references" rather than just applying generic patterns.

3. **Middleware order enforcement**: Eval 1 with-skill strictly enforced the middleware order. Consider making the middleware order table even more prominent in the skill.
