# SaaS Backend Scaffold: Express + TypeScript

## Step 0: Requirements (Inferred)

| Dimension | Decision |
|-----------|----------|
| Stack | Express + TypeScript (backend only) |
| Service type | API-only SaaS backend |
| Database | PostgreSQL (standard for SaaS, supports relations well) |
| Integration | REST |
| Real-time | Not required for this scaffold |
| Auth | JWT + refresh tokens (httpOnly cookie) |
| Resources | Teams → Projects → Tasks (nested hierarchy) |
| Roles | admin, editor, viewer (team-scoped RBAC) |

## Step 1: Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Project structure | Feature-first | Iron Rule #1 — organize by feature, not layer |
| API client approach | REST with typed fetch wrapper | Express backend; frontend can use React Query later |
| Auth strategy | JWT (15min access) + httpOnly refresh cookie | Section 6 — short expiry, no localStorage |
| Real-time method | N/A | Not required |
| Error handling | Typed error hierarchy + global handler | Iron Rule #5 — every error typed, logged, consistent format |

## Step 2: Scaffold Checklist

- [x] Feature-first directory structure
- [x] Three-layer architecture (Controller → Service → Repository)
- [x] Nested router hierarchy (teams/:teamId/projects/:projectId/tasks/:taskId)
- [x] Typed error classes (AppError, NotFoundError, ValidationError, ForbiddenError, UnauthorizedError)
- [x] Field-level validation error detail (FieldError[])
- [x] Global error handler middleware
- [x] Centralized config with env validation
- [x] Request ID middleware
- [x] RBAC middleware (authorize('admin', 'editor'))
- [x] Auth middleware (JWT verification)
- [x] .env.example committed

## Step 3: Implementation

### Project Structure

```
src/
  teams/
    team.controller.ts
    team.service.ts
    team.repository.ts
    team.dto.ts
    team.routes.ts
    team.test.ts
  projects/
    project.controller.ts
    project.service.ts
    project.repository.ts
    project.dto.ts
    project.routes.ts
    project.test.ts
  tasks/
    task.controller.ts
    task.service.ts
    task.repository.ts
    task.dto.ts
    task.routes.ts
    task.test.ts
  auth/
    auth.controller.ts
    auth.service.ts
    auth.middleware.ts
    auth.dto.ts
    auth.routes.ts
  shared/
    errors/
      AppError.ts
      NotFoundError.ts
      ValidationError.ts
      UnauthorizedError.ts
      ForbiddenError.ts
      FieldError.ts
      errorHandler.ts
    middleware/
      requestId.ts
      validate.ts
    config/
      env.ts
    database/
      connection.ts
    logging/
      logger.ts
  app.ts
  server.ts
```

### Core Files

#### `src/shared/errors/FieldError.ts`

```typescript
export interface FieldError {
  field: string;
  message: string;
  value?: unknown;
}
```

#### `src/shared/errors/AppError.ts`

```typescript
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: string;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    isOperational = true,
    details?: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

#### `src/shared/errors/NotFoundError.ts`

```typescript
import { AppError } from './AppError';

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(
      `${resource} not found`,
      'NOT_FOUND',
      404,
      true,
      `Resource '${resource}' with id '${id}' does not exist`,
    );
  }
}
```

#### `src/shared/errors/ValidationError.ts`

```typescript
import { AppError } from './AppError';
import type { FieldError } from './FieldError';

export class ValidationError extends AppError {
  public readonly fields: FieldError[];

  constructor(fields: FieldError[]) {
    const message = fields.map((f) => `${f.field}: ${f.message}`).join('; ');
    super(message, 'VALIDATION_ERROR', 400, true);
    this.fields = fields;
  }
}
```

#### `src/shared/errors/UnauthorizedError.ts`

```typescript
import { AppError } from './AppError';

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401, true);
  }
}
```

#### `src/shared/errors/ForbiddenError.ts`

```typescript
import { AppError } from './AppError';

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'FORBIDDEN', 403, true);
  }
}
```

#### `src/shared/errors/errorHandler.ts`

```typescript
import type { Request, Response, NextFunction } from 'express';
import { AppError } from './AppError';
import { logger } from '../logging/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId ?? 'unknown';

  if (err instanceof AppError && err.isOperational) {
    logger.warn({
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      requestId,
      path: req.path,
      method: req.method,
    });

    const body: Record<string, unknown> = {
      error: err.code,
      status: err.statusCode,
      message: err.message,
      requestId,
    };

    if (err.details) {
      body.detail = err.details;
    }

    // Flatten ValidationError fields into the response
    if ('fields' in err) {
      body.fields = (err as any).fields;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // Programming or unknown error — never leak internals
  logger.error({
    message: 'Unhandled error',
    error: err.message,
    stack: err.stack,
    requestId,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    status: 500,
    message: 'An unexpected error occurred',
    requestId,
  });
}
```

#### `src/shared/config/env.ts`

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment variables: ${missing}`);
  }
  env = result.data;
  return env;
}

export function getEnv(): Env {
  if (!env) throw new Error('Environment not loaded — call loadEnv() at startup');
  return env;
}
```

#### `src/shared/middleware/requestId.ts`

```typescript
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  req.requestId = req.headers['x-request-id'] as string ?? randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
```

#### `src/shared/middleware/validate.ts`

```typescript
import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { ValidationError } from '../errors/ValidationError';
import type { FieldError } from '../errors/FieldError';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (result.success) {
      req.body = result.data.body ?? req.body;
      next();
      return;
    }

    const fields: FieldError[] = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    next(new ValidationError(fields));
  };
}
```

#### `src/auth/auth.middleware.ts`

```typescript
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getEnv } from '../shared/config/env';
import { UnauthorizedError } from '../shared/errors/UnauthorizedError';
import { ForbiddenError } from '../shared/errors/ForbiddenError';

type TeamRole = 'admin' | 'editor' | 'viewer';

interface TokenPayload {
  sub: string;
  teamId: string;
  role: TeamRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed authorization header'));
  }

  try {
    const { JWT_SECRET } = getEnv();
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as TokenPayload;
    req.user = payload;
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function authorize(...roles: TeamRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Requires one of: ${roles.join(', ')}`));
    }
    next();
  };
}
```

### Router Hierarchy

The nested resource structure: `/teams/:teamId/projects/:projectId/tasks/:taskId`

#### `src/teams/team.routes.ts`

```typescript
import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { validate } from '../shared/middleware/validate';
import { TeamController } from './team.controller';
import { createTeamSchema, updateTeamSchema } from './team.dto';
import { projectRoutes } from '../projects/project.routes';

const router = Router();
const controller = new TeamController();

router.use(authenticate);

router.post('/', validate(createTeamSchema), controller.create);
router.get('/', controller.list);
router.get('/:teamId', controller.getOne);
router.patch('/:teamId', validate(updateTeamSchema), controller.update);
router.delete('/:teamId', controller.remove);

// Nested: projects under teams
router.use('/:teamId/projects', projectRoutes);

export const teamRoutes = router;
```

#### `src/projects/project.routes.ts`

```typescript
import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { authorize } from '../auth/auth.middleware';
import { validate } from '../shared/middleware/validate';
import { ProjectController } from './project.controller';
import { createProjectSchema, updateProjectSchema } from './project.dto';
import { taskRoutes } from '../tasks/task.routes';

const router = Router({ mergeParams: true });
const controller = new ProjectController();

router.use(authenticate);

router.post(
  '/',
  authorize('admin', 'editor'),
  validate(createProjectSchema),
  controller.create,
);
router.get('/', controller.list);
router.get('/:projectId', controller.getOne);
router.patch(
  '/:projectId',
  authorize('admin', 'editor'),
  validate(updateProjectSchema),
  controller.update,
);
router.delete('/:projectId', authorize('admin'), controller.remove);

// Nested: tasks under projects
router.use('/:projectId/tasks', taskRoutes);

export const projectRoutes = router;
```

#### `src/tasks/task.routes.ts`

```typescript
import { Router } from 'express';
import { authenticate } from '../auth/auth.middleware';
import { authorize } from '../auth/auth.middleware';
import { validate } from '../shared/middleware/validate';
import { TaskController } from './task.controller';
import { createTaskSchema, updateTaskSchema } from './task.dto';

const router = Router({ mergeParams: true });
const controller = new TaskController();

router.use(authenticate);

router.post(
  '/',
  authorize('admin', 'editor'),
  validate(createTaskSchema),
  controller.create,
);
router.get('/', controller.list);
router.get('/:taskId', controller.getOne);
router.patch(
  '/:taskId',
  authorize('admin', 'editor'),
  validate(updateTaskSchema),
  controller.update,
);
router.delete('/:taskId', authorize('admin'), controller.remove);

export const taskRoutes = router;
```

### DTOs (Zod Schemas)

#### `src/teams/team.dto.ts`

```typescript
import { z } from 'zod';

export const createTeamSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
  }),
  params: z.object({}).optional(),
  query: z.object({}).optional(),
});

export const updateTeamSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
  }),
  params: z.object({ teamId: z.string().uuid() }),
  query: z.object({}).optional(),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
```

#### `src/projects/project.dto.ts`

```typescript
import { z } from 'zod';

export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    status: z.enum(['active', 'archived']).default('active'),
  }),
  params: z.object({ teamId: z.string().uuid() }),
  query: z.object({}).optional(),
});

export const updateProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    status: z.enum(['active', 'archived']).optional(),
  }),
  params: z.object({ teamId: z.string().uuid(), projectId: z.string().uuid() }),
  query: z.object({}).optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
```

#### `src/tasks/task.dto.ts`

```typescript
import { z } from 'zod';

export const createTaskSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(300),
    description: z.string().max(5000).optional(),
    status: z.enum(['todo', 'in_progress', 'done']).default('todo'),
    assigneeId: z.string().uuid().optional(),
    dueDate: z.string().datetime().optional(),
  }),
  params: z.object({ teamId: z.string().uuid(), projectId: z.string().uuid() }),
  query: z.object({}).optional(),
});

export const updateTaskSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(5000).optional(),
    status: z.enum(['todo', 'in_progress', 'done']).optional(),
    assigneeId: z.string().uuid().optional(),
    dueDate: z.string().datetime().optional(),
  }),
  params: z.object({
    teamId: z.string().uuid(),
    projectId: z.string().uuid(),
    taskId: z.string().uuid(),
  }),
  query: z.object({}).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
```

### App Wiring

#### `src/app.ts`

```typescript
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { requestIdMiddleware } from './shared/middleware/requestId';
import { errorHandler } from './shared/errors/errorHandler';
import { teamRoutes } from './teams/team.routes';
import { loadEnv } from './shared/config/env';
import { logger } from './shared/logging/logger';

export function createApp() {
  const env = loadEnv();

  const app = express();

  // Middleware order per Section 6
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN?.split(',') ?? [] }));
  app.use(express.json());

  // Routes
  app.use('/api/teams', teamRoutes);

  // Health checks per Section 11
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/ready', async (_req, res) => {
    // Add dependency checks here (DB, Redis, etc.)
    res.json({ status: 'ready' });
  });

  // Error handler — MUST be last
  app.use(errorHandler);

  return app;
}
```

#### `src/server.ts`

```typescript
import { createApp } from './app';
import { getEnv } from './shared/config/env';
import { logger } from './shared/logging/logger';

const app = createApp();
const env = getEnv();

const server = app.listen(env.PORT, () => {
  logger.info({ message: `Server listening on port ${env.PORT}`, env: env.NODE_ENV });
});

// Graceful shutdown per Section 11
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
```

### `.env.example`

```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/saas_db
JWT_SECRET=your-32-char-min-secret-here-replace-me
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your-32-char-min-refresh-secret-here
JWT_REFRESH_EXPIRES_IN=7d
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:3000
```

### Error Response Shapes

The frontend receives consistent JSON for every error:

**Validation Error (400):**
```json
{
  "error": "VALIDATION_ERROR",
  "status": 400,
  "message": "name: Required; dueDate: Invalid datetime",
  "requestId": "a1b2c3d4",
  "fields": [
    { "field": "name", "message": "Required" },
    { "field": "dueDate", "message": "Invalid datetime" }
  ]
}
```

**Not Found (404):**
```json
{
  "error": "NOT_FOUND",
  "status": 404,
  "message": "Team not found",
  "requestId": "e5f6g7h8",
  "detail": "Resource 'Team' with id 'abc-123' does not exist"
}
```

**Unauthorized (401):**
```json
{
  "error": "UNAUTHORIZED",
  "status": 401,
  "message": "Invalid or expired token",
  "requestId": "i9j0k1l2"
}
```

**Forbidden (403):**
```json
{
  "error": "FORBIDDEN",
  "status": 403,
  "message": "Insufficient permissions",
  "requestId": "m3n4o5p6"
}
```

**Internal Server Error (500):**
```json
{
  "error": "INTERNAL_ERROR",
  "status": 500,
  "message": "An unexpected error occurred",
  "requestId": "q7r8s9t0"
}
```

## Step 4: Verification Checklist

| Check | Status | Notes |
|-------|--------|-------|
| Build check | ⬜ | Run `tsc --noEmit` — all types resolve |
| Smoke test | ⬜ | `GET /health` returns `{ status: 'ok' }` |
| Integration check | ⬜ | Create team → create project → create task flows through nested routes |
| Error shape check | ⬜ | Send invalid body, verify `VALIDATION_ERROR` with `fields` array |
| Auth check | ⬜ | Unauthenticated request returns 401; viewer role returns 403 on POST |

## Step 5: Handoff Summary

**What was built:** Express + TypeScript SaaS backend scaffold with feature-first structure, nested router hierarchy (teams → projects → tasks), typed error system with field-level validation detail, JWT auth with RBAC middleware, centralized env config, and global error handler.

**How to run:**
1. `cp .env.example .env` and fill in real values
2. `npm install` (express, zod, jsonwebtoken, helmet, cors, uuid)
3. `npx tsc --noEmit` to type-check
4. `npm run dev` to start

**What's missing:**
- Database layer (repository implementations, migrations, connection pooling)
- Actual service layer business logic
- Refresh token endpoint and rotation
- Rate limiting middleware
- Tests (unit + integration)
- Docker / deployment config

**Key files:**
- `src/shared/errors/` — Error hierarchy and global handler
- `src/shared/config/env.ts` — Fail-fast env validation
- `src/auth/auth.middleware.ts` — JWT auth + RBAC authorize()
- `src/teams/team.routes.ts` — Top-level router with nested project/task routes
- `src/app.ts` — Express app wiring with middleware order