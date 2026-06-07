# SaaS Backend Scaffold: Express + TypeScript

## Project Structure

```
saas-backend/
├── src/
│   ├── index.ts                    # Entry point
│   ├── app.ts                      # Express app factory
│   ├── config/
│   │   └── env.ts                  # Env var validation (zod)
│   ├── routes/
│   │   ├── index.ts                # Route aggregator
│   │   ├── teams/
│   │   │   ├── team.routes.ts      # /api/teams
│   │   │   ├── project.routes.ts   # /api/teams/:teamId/projects
│   │   │   └── task.routes.ts      # /api/teams/:teamId/projects/:projectId/tasks
│   │   └── health.routes.ts        # /api/health
│   ├── middleware/
│   │   ├── auth.ts                 # JWT auth
│   │   ├── requireRole.ts          # Role-based access (admin/editor/viewer)
│   │   ├── errorHandler.ts         # Global error → consistent JSON
│   │   └── validate.ts             # Request validation helper
│   ├── errors/
│   │   ├── AppError.ts             # Base error class
│   │   ├── NotFoundError.ts
│   │   ├── ForbiddenError.ts
│   │   ├── UnauthorizedError.ts
│   │   ├── ConflictError.ts
│   │   └── ValidationError.ts      # Field-level detail
│   ├── types/
│   │   ├── express.d.ts            # Augment Request with user
│   │   ├── roles.ts                # Role & permission types
│   │   └── api.ts                  # Shared response shapes
│   └── utils/
│       └── asyncHandler.ts         # Try/catch wrapper for routes
├── tsconfig.json
├── package.json
└── .env.example
```

## Key Architecture Decisions

1. **Nested routes** — Teams own projects, projects own tasks. The URL hierarchy mirrors this: `/teams/:teamId/projects/:projectId/tasks`. Route files are co-located under `routes/teams/` to keep the nesting explicit.

2. **Role-based access** — Three roles (`admin`, `editor`, `viewer`) with a permission map. `requireRole` middleware checks membership before the handler runs.

3. **Typed error system** — Every error subclass carries an HTTP status, a machine-readable `code`, and an optional `details` bag. `ValidationError` uses `FieldError[]` for field-level detail so the frontend can map errors to form fields.

4. **Consistent response shape** — All success responses go through a helper; all errors go through `errorHandler`. The frontend always gets `{ ok, data }` or `{ ok: false, error: { code, message, details? } }`.

---

## Code

### `src/types/roles.ts`

```ts
export const ROLES = ['admin', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 3,
  editor: 2,
  viewer: 1,
};

export const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: ['team:manage', 'project:create', 'project:edit', 'project:delete', 'task:create', 'task:edit', 'task:delete'],
  editor: ['project:create', 'project:edit', 'task:create', 'task:edit'],
  viewer: ['task:create'],
};

export function hasPermission(role: Role, permission: string): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function roleAtLeast(held: Role, required: Role): boolean {
  return ROLE_HIERARCHY[held] >= ROLE_HIERARCHY[required];
}
```

### `src/types/api.ts`

```ts
export interface ApiResponse<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: FieldError[];
  };
}

export interface FieldError {
  field: string;
  message: string;
  value?: unknown;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;
```

### `src/types/express.d.ts`

```ts
import { Role } from './roles';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        teamId: string;
        role: Role;
      };
    }
  }
}
```

### `src/errors/AppError.ts`

```ts
import { FieldError } from '../types/api';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: FieldError[];
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: FieldError[],
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
    Error.captureStackTrace(this, this.constructor);
  }
}
```

### `src/errors/NotFoundError.ts`

```ts
import { AppError } from './AppError';

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, 'NOT_FOUND', `${resource} with id "${id}" not found`);
  }
}
```

### `src/errors/ForbiddenError.ts`

```ts
import { AppError } from './AppError';

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, 'FORBIDDEN', message);
  }
}
```

### `src/errors/UnauthorizedError.ts`

```ts
import { AppError } from './AppError';

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message);
  }
}
```

### `src/errors/ConflictError.ts`

```ts
import { AppError } from './AppError';

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}
```

### `src/errors/ValidationError.ts`

```ts
import { AppError } from './AppError';
import { FieldError } from '../types/api';

export class ValidationError extends AppError {
  constructor(message: string, details: FieldError[]) {
    super(422, 'VALIDATION_ERROR', message, details);
  }

  /** Convenience: build from a ZodError */
  static fromZodError(zodErr: { errors: { path: (string | number)[]; message: string }[] }): ValidationError {
    const details: FieldError[] = zodErr.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return new ValidationError('Validation failed', details);
  }
}
```

### `src/middleware/errorHandler.ts`

```ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { ApiError } from '../types/api';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  // Log full stack in dev; in prod, log operational errors only
  if (err instanceof AppError && err.isOperational) {
    console.error(`[AppError] ${err.code}: ${err.message}`);
  } else if (!(err instanceof AppError)) {
    console.error('[Unexpected]', err);
  }

  if (err instanceof AppError) {
    const body: ApiError = {
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Unknown errors — don't leak internals
  res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
```

### `src/middleware/requireRole.ts`

```ts
import { Request, Response, NextFunction } from 'express';
import { Role, roleAtLeast } from '../types/roles';
import { ForbiddenError } from '../errors/ForbiddenError';

export function requireRole(minimumRole: Role) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new ForbiddenError('Not authenticated'));
    }
    if (!roleAtLeast(req.user.role, minimumRole)) {
      return next(new ForbiddenError(`Requires ${minimumRole} role or above`));
    }
    next();
  };
}
```

### `src/middleware/validate.ts`

```ts
import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/ValidationError';

/** Validate request body against a Zod schema. Throws ValidationError on failure. */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (result.success) {
      req.body = result.data; // replace with parsed/trimmed data
      next();
    } else {
      next(ValidationError.fromZodError(result.error));
    }
  };
}
```

### `src/utils/asyncHandler.ts`

```ts
import { Request, Response, NextFunction } from 'express';

/** Wraps async route handlers so thrown errors go to errorHandler automatically. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

### `src/routes/teams/team.routes.ts`

```ts
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireRole } from '../../middleware/requireRole';
import { NotFoundError } from '../../errors/NotFoundError';
import { projectRoutes } from './project.routes';

export const teamRoutes = Router();

// List teams
teamRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    // TODO: fetch from DB
    res.json({ ok: true, data: [] });
  }),
);

// Create team
teamRoutes.post(
  '/',
  asyncHandler(async (req, res) => {
    // TODO: validate body, insert into DB
    res.status(201).json({ ok: true, data: { id: 'new-team-id', name: req.body.name } });
  }),
);

// Get team by ID
teamRoutes.get(
  '/:teamId',
  asyncHandler(async (req, res) => {
    const team = null; // TODO: fetch from DB
    if (!team) throw new NotFoundError('Team', req.params.teamId);
    res.json({ ok: true, data: team });
  }),
);

// Update team (admin only)
teamRoutes.patch(
  '/:teamId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    // TODO: update in DB
    res.json({ ok: true, data: { id: req.params.teamId, updated: true } });
  }),
);

// Delete team (admin only)
teamRoutes.delete(
  '/:teamId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    // TODO: soft-delete in DB
    res.json({ ok: true, data: { id: req.params.teamId, deleted: true } });
  }),
);

// Nest project routes under team
teamRoutes.use('/:teamId/projects', projectRoutes);
```

### `src/routes/teams/project.routes.ts`

```ts
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireRole } from '../../middleware/requireRole';
import { NotFoundError } from '../../errors/NotFoundError';
import { taskRoutes } from './task.routes';

export const projectRoutes = Router();

// List projects in team
projectRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    // req.params.teamId available from parent route
    res.json({ ok: true, data: [] });
  }),
);

// Create project (editor+)
projectRoutes.post(
  '/',
  requireRole('editor'),
  asyncHandler(async (req, res) => {
    res.status(201).json({ ok: true, data: { id: 'new-project-id', teamId: req.params.teamId } });
  }),
);

// Get project
projectRoutes.get(
  '/:projectId',
  asyncHandler(async (req, res) => {
    const project = null; // TODO: fetch from DB
    if (!project) throw new NotFoundError('Project', req.params.projectId);
    res.json({ ok: true, data: project });
  }),
);

// Update project (editor+)
projectRoutes.patch(
  '/:projectId',
  requireRole('editor'),
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: { id: req.params.projectId, updated: true } });
  }),
);

// Delete project (admin only)
projectRoutes.delete(
  '/:projectId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: { id: req.params.projectId, deleted: true } });
  }),
);

// Nest task routes under project
projectRoutes.use('/:projectId/tasks', taskRoutes);
```

### `src/routes/teams/task.routes.ts`

```ts
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireRole } from '../../middleware/requireRole';
import { NotFoundError } from '../../errors/NotFoundError';
import { validateBody } from '../../middleware/validate';
import { z } from 'zod';

export const taskRoutes = Router();

const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  assigneeId: z.string().uuid().optional(),
});

// List tasks in project
taskRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    // req.params.teamId and req.params.projectId available from parent routes
    res.json({ ok: true, data: [] });
  }),
);

// Create task (editor+)
taskRoutes.post(
  '/',
  requireRole('editor'),
  validateBody(createTaskSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ ok: true, data: { id: 'new-task-id', ...req.body } });
  }),
);

// Get task
taskRoutes.get(
  '/:taskId',
  asyncHandler(async (req, res) => {
    const task = null; // TODO: fetch from DB
    if (!task) throw new NotFoundError('Task', req.params.taskId);
    res.json({ ok: true, data: task });
  }),
);

// Update task (editor+)
taskRoutes.patch(
  '/:taskId',
  requireRole('editor'),
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: { id: req.params.taskId, updated: true } });
  }),
);

// Delete task (admin only)
taskRoutes.delete(
  '/:taskId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: { id: req.params.taskId, deleted: true } });
  }),
);
```

### `src/routes/health.routes.ts`

```ts
import { Router } from 'express';

export const healthRoutes = Router();

healthRoutes.get('/', (_req, res) => {
  res.json({ ok: true, data: { status: 'healthy', timestamp: new Date().toISOString() } });
});
```

### `src/routes/index.ts`

```ts
import { Router } from 'express';
import { teamRoutes } from './teams/team.routes';
import { healthRoutes } from './health.routes';

export const apiRoutes = Router();

apiRoutes.use('/health', healthRoutes);
apiRoutes.use('/teams', teamRoutes);
```

### `src/app.ts`

```ts
import express from 'express';
import { apiRoutes } from './routes';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(express.json());

  // Mount all API routes under /api
  app.use('/api', apiRoutes);

  // Catch-all 404 for unmatched routes
  app.use((_req, res) => {
    res.status(404).json({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  // Global error handler — must be last
  app.use(errorHandler);

  return app;
}
```

### `src/index.ts`

```ts
import { createApp } from './app';

const PORT = process.env.PORT ?? 3000;

const app = createApp();
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### `src/config/env.ts`

```ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
});

export const env = envSchema.parse(process.env);
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### `package.json`

```json
{
  "name": "saas-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^4.21.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

---

## Error Response Shapes

Every API response follows one of two shapes. The frontend never needs to guess.

**Success:**
```json
{
  "ok": true,
  "data": { "id": "abc-123", "name": "Acme Team" }
}
```

**Error (generic):**
```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Team with id \"abc-123\" not found"
  }
}
```

**Error (validation — field-level detail):**
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      { "field": "title", "message": "Title is required" },
      { "field": "assigneeId", "message": "Invalid uuid" }
    ]
  }
}
```

The `details` array is only present on `VALIDATION_ERROR` responses. The frontend can iterate `details` and map each `field` to the corresponding form input — no parsing required.

---

## Route Hierarchy Summary

```
/api/health                                    GET
/api/teams                                     GET, POST
/api/teams/:teamId                             GET, PATCH (admin), DELETE (admin)
/api/teams/:teamId/projects                    GET, POST (editor+)
/api/teams/:teamId/projects/:projectId         GET, PATCH (editor+), DELETE (admin)
/api/teams/:teamId/projects/:projectId/tasks   GET, POST (editor+)
/api/teams/:teamId/projects/:projectId/tasks/:taskId  GET, PATCH (editor+), DELETE (admin)
```

Role requirements:
- **viewer** — read-only access to teams/projects/tasks; can create tasks
- **editor** — everything viewer can do, plus create/edit projects and tasks
- **admin** — full control including delete and team management

---

## Why This Structure

- **Nested routers** — Express `Router()` with `use()` mounts child routers cleanly. Each resource file owns its own CRUD; nesting is explicit in the route tree, not buried in path strings.
- **Error class hierarchy** — `AppError` base carries `statusCode`, `code`, `message`, and optional `details`. Subclasses (`NotFoundError`, `ForbiddenError`, etc.) set sensible defaults. The global `errorHandler` catches all `AppError` instances and formats them into the consistent `ApiError` shape. Unknown errors get a 500 with no internal leakage.
- **`ValidationError.fromZodError`** — Bridges Zod's error format into `FieldError[]` so validation stays in one place (the Zod schemas) and the error shape stays consistent.
- **`asyncHandler`** — Eliminates try/catch boilerplate in every route handler. Thrown errors bubble to `errorHandler` automatically.
- **`requireRole` middleware** — Uses the role hierarchy so `requireRole('editor')` passes for both `admin` and `editor`. Keeps authorization declarative and per-route.