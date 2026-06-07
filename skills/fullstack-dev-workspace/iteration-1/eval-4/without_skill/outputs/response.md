# Fullstack Integration Patterns: Rust (Actix-web + async-graphql) + Svelte

This guide covers the three core integration patterns for a photo gallery application:

1. **GraphQL Subscriptions** — real-time photo feed updates via WebSocket
2. **File Upload with Presigned URLs** — S3 direct-upload flow
3. **Type Sharing** — keeping Rust and TypeScript types in sync

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Svelte Frontend                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │ GraphQL   │  │ GraphQL  │  │ Generated Types     │  │
│  │ Client    │  │ WS Sub   │  │ (from schema.json)   │  │
│  └─────┬─────┘  └────┬─────┘  └──────────┬───────────┘  │
│        │              │                    │              │
└────────┼──────────────┼────────────────────┼──────────────┘
         │ HTTP/POST    │ WS (graphql-ws)    │ build-time
         │              │                    │
┌────────┼──────────────┼────────────────────┼──────────────┐
│  Rust Backend         │                    │              │
│  ┌─────┴─────┐  ┌────┴─────┐  ┌──────────┴───────────┐  │
│  │ Actix-web  │  │ WS       │  │ schema.sdl() export  │  │
│  │ POST /graphql│ │ /ws      │  │ (CI codegen step)   │  │
│  └─────┬──────┘  └────┬─────┘  └──────────────────────┘  │
│        │              │                                   │
│  ┌─────┴──────────────┴──────┐                           │
│  │ async-graphql Schema      │                           │
│  │ Query | Mutation | Sub    │                           │
│  └─────┬──────────────┬──────┘                           │
│        │              │                                  │
│  ┌─────┴─────┐  ┌────┴─────┐                           │
│  │ PostgreSQL │  │ S3       │                           │
│  │ (sqlx)     │  │ (presign)│                           │
│  └───────────┘  └──────────┘                           │
└─────────────────────────────────────────────────────────┘
```

---

## 1. GraphQL Subscriptions

### 1.1 Backend: Subscription Definition (Rust)

The subscription uses `async_graphql::Subscription` derive and returns a `Stream` that yields items over time. A `tokio::sync::broadcast` channel bridges database events to WebSocket subscribers.

```rust
// src/graphql/subscriptions.rs
use async_graphql::{Context, Subscription};
use futures_util::stream::Stream;
use tokio::sync::broadcast;
use serde::Serialize;

#[derive(Clone, Serialize, async_graphql::SimpleObject)]
pub struct PhotoAdded {
    pub id: uuid::Uuid,
    pub title: String,
    pub url: String,
    pub uploaded_by: uuid::Uuid,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub type PhotoEventSender = broadcast::Sender<PhotoAdded>;

#[derive(Default)]
pub struct GallerySubscription;

#[Subscription]
impl GallerySubscription {
    /// Fires whenever a new photo is added to the gallery.
    async fn photo_added(
        &self,
        ctx: &Context<'_>,
    ) -> impl Stream<Item = PhotoAdded> {
        // Retrieve the broadcast channel from the schema's global data
        let sender = ctx.data_unchecked::<PhotoEventSender>();
        let mut rx = sender.subscribe();

        // Convert the broadcast receiver into an async_stream
        async_stream::stream! {
            while let Ok(photo) = rx.recv().await {
                yield photo;
            }
        }
    }
}
```

### 1.2 Backend: Wiring into the Schema

```rust
// src/graphql/schema.rs
use async_graphql::{Schema, EmptyMutation};
use crate::graphql::{
    queries::GalleryQuery,
    mutations::GalleryMutation,
    subscriptions::GallerySubscription,
    uploads::GalleryMutationUpload, // see section 2
};
use crate::state::AppState;
use tokio::sync::broadcast;

pub type AppSchema = Schema<GalleryQuery, GalleryMutation, GallerySubscription>;

pub fn create_schema(state: AppState) -> AppSchema {
    // Broadcast channel for real-time photo events
    let (photo_sender, _) = broadcast::channel(256);

    Schema::build(GalleryQuery, GalleryMutation, GallerySubscription)
        .data(state.db_pool)          // sqlx::PgPool
        .data(state.s3_client)        // aws_sdk_s3::Client
        .data(photo_sender)           // PhotoEventSender
        .finish()
}
```

### 1.3 Backend: Actix-web WebSocket Handler

```rust
// src/main.rs
use actix_web::{web, App, HttpRequest, HttpResponse, HttpServer};
use async_graphql_actix_web::{GraphQLRequest, GraphQLResponse, GraphQLSubscription};
use crate::graphql::schema::{AppSchema, create_schema};
use crate::state::AppState;

async fn graphql_post(
    schema: web::Data<AppSchema>,
    req: GraphQLRequest,
) -> web::Json<GraphQLResponse> {
    web::Json(schema.execute(req.into_inner()).await.into())
}

async fn graphql_ws(
    schema: web::Data<AppSchema>,
    req: HttpRequest,
    payload: web::Payload,
) -> actix_web::Result<HttpResponse> {
    GraphQLSubscription::new(Schema::clone(&**schema))
        .start(&req, payload)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let state = AppState::new().await;
    let schema = create_schema(state);

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(schema.clone()))
            .route("/graphql", web::post().to(graphql_post))
            .route("/ws", web::get().to(graphql_ws))
    })
    .bind("0.0.0.0:8000")?
    .run()
    .await
}
```

### 1.4 Backend: Broadcasting After Mutation

When a photo is created (after the presigned upload completes and the user confirms), the mutation publishes to the broadcast channel:

```rust
// src/graphql/mutations.rs
use async_graphql::{Context, Object, Result};
use sqlx::PgPool;
use crate::graphql::subscriptions::{PhotoAdded, PhotoEventSender};

pub struct GalleryMutation;

#[Object]
impl GalleryMutation {
    /// Called by the client after successfully uploading to S3.
    /// Creates the DB record and broadcasts the event.
    async fn confirm_photo_upload(
        &self,
        ctx: &Context<'_>,
        input: ConfirmPhotoInput,
    ) -> Result<Photo> {
        let pool = ctx.data_unchecked::<PgPool>();
        let sender = ctx.data_unchecked::<PhotoEventSender>();

        // Insert into PostgreSQL
        let photo = sqlx::query_as!(
            Photo,
            r#"
            INSERT INTO photos (id, title, url, uploaded_by, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id, title, url, uploaded_by, created_at
            "#,
            input.id,
            input.title,
            input.url,
            input.uploaded_by,
        )
        .fetch_one(pool)
        .await?;

        // Broadcast to all WebSocket subscribers
        let _ = sender.send(PhotoAdded {
            id: photo.id,
            title: photo.title.clone(),
            url: photo.url.clone(),
            uploaded_by: photo.uploaded_by,
            created_at: photo.created_at,
        });

        Ok(photo)
    }
}
```

### 1.5 Frontend: Svelte Subscription Client

Use `graphql-ws` (the `graphql-transport-ws` protocol) — the same protocol that `async-graphql`'s Actix integration speaks natively.

```typescript
// src/lib/graphql/client.ts
import { createClient } from 'graphql-ws';
import { browser } from '$app/environment';

export const wsClient = browser
  ? createClient({
      url: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,
      connectionParams: () => {
        const token = localStorage.getItem('auth_token');
        return token ? { authorization: `Bearer ${token}` } : {};
      },
      shouldRetry: () => true,
      retryAttempts: 10,
      retryWait: (attempts) =>
        new Promise((resolve) => setTimeout(resolve, Math.min(attempts * 1000, 10000))),
    })
  : null;
```

```svelte
<!-- src/lib/components/PhotoFeed.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { wsClient } from '$lib/graphql/client';
  import type { PhotoAdded } from '$lib/graphql/types';

  let photos: PhotoAdded[] = $state([]);
  let unsubscribe: (() => void) | null = null;

  const PHOTO_ADDED_SUBSCRIPTION = `
    subscription OnPhotoAdded {
      photoAdded {
        id
        title
        url
        uploadedBy
        createdAt
      }
    }
  `;

  onMount(() => {
    if (!wsClient) return;

    unsubscribe = wsClient.subscribe(
      {
        query: PHOTO_ADDED_SUBSCRIPTION,
      },
      {
        next: (result) => {
          if (result.data?.photoAdded) {
            const photo = result.data.photoAdded as PhotoAdded;
            photos = [photo, ...photos];
          }
        },
        error: (err) => {
          console.error('Subscription error:', err);
        },
        complete: () => {
          console.log('Subscription closed');
        },
      }
    );
  });

  onDestroy(() => {
    unsubscribe?.();
  });
</script>

<div class="photo-feed">
  {#each photos as photo (photo.id)}
    <div class="photo-card">
      <img src={photo.url} alt={photo.title} loading="lazy" />
      <h3>{photo.title}</h3>
      <time>{new Date(photo.createdAt).toLocaleDateString()}</time>
    </div>
  {/each}
</div>
```

### 1.6 SvelteKit: Server-Side Subscription (SSR Considerations)

For SSR, avoid WebSocket connections on the server. Gate with `browser` checks:

```typescript
// src/lib/graphql/subscription.ts
import { browser } from '$app/environment';
import { wsClient } from './client';

export function subscribeToPhotos(
  onNext: (photo: PhotoAdded) => void,
  onError: (err: unknown) => void
): () => void {
  if (!browser || !wsClient) return () => {};

  return wsClient.subscribe(
    { query: PHOTO_ADDED_SUBSCRIPTION },
    {
      next: (result) => {
        if (result.data?.photoAdded) onNext(result.data.photoAdded);
      },
      error: onError,
      complete: () => {},
    }
  );
}
```

---

## 2. File Upload with Presigned URLs

The presigned URL pattern avoids routing large binary payloads through the GraphQL server. The flow:

1. Client requests a presigned upload URL from the backend
2. Client uploads directly to S3 using the presigned URL
3. Client calls `confirmPhotoUpload` mutation to create the DB record
4. Backend broadcasts the new photo via subscription

### 2.1 Backend: Presigned URL Mutation

```rust
// src/graphql/uploads.rs
use async_graphql::{Context, Object, InputObject, Result, SimpleObject};
use aws_sdk_s3::presigning::PresigningConfig;
use aws_sdk_s3::Client as S3Client;
use chrono::Duration;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(InputObject)]
pub struct RequestUploadInput {
    pub filename: String,
    pub content_type: String,
    pub gallery_id: Uuid,
}

#[derive(SimpleObject)]
pub struct PresignedUpload {
    pub upload_id: Uuid,
    pub upload_url: String,
    pub object_key: String,
}

pub struct GalleryMutationUpload;

#[Object]
impl GalleryMutationUpload {
    /// Step 1: Request a presigned S3 URL for direct upload.
    async fn request_photo_upload(
        &self,
        ctx: &Context<'_>,
        input: RequestUploadInput,
    ) -> Result<PresignedUpload> {
        let s3 = ctx.data_unchecked::<S3Client>();
        let config = ctx.data_unchecked::<aws_sdk_s3::Config>();

        let upload_id = Uuid::new_v4();
        let object_key = format!("uploads/{}/{}", input.gallery_id, upload_id);

        // Generate a presigned PUT URL (valid for 15 minutes)
        let presigned = s3
            .put_object()
            .bucket(&config.bucket_name)
            .key(&object_key)
            .content_type(&input.content_type)
            .presigned(
                PresigningConfig::builder()
                    .expires_in(Duration::minutes(15).to_std()?)
                    .build()?
            )
            .await?;

        Ok(PresignedUpload {
            upload_id,
            upload_url: presigned.uri().to_string(),
            object_key,
        })
    }
}
```

### 2.2 Backend: Confirm Upload Mutation

```rust
// Already shown in section 1.4 — included here for completeness

#[derive(InputObject)]
pub struct ConfirmPhotoInput {
    pub id: Uuid,
    pub title: String,
    pub url: String,
    pub uploaded_by: Uuid,
}

#[Object]
impl GalleryMutation {
    async fn confirm_photo_upload(
        &self,
        ctx: &Context<'_>,
        input: ConfirmPhotoInput,
    ) -> Result<Photo> {
        let pool = ctx.data_unchecked::<PgPool>();
        let sender = ctx.data_unchecked::<PhotoEventSender>();

        // Verify the object exists in S3 before committing
        let s3 = ctx.data_unchecked::<S3Client>();
        let head = s3
            .head_object()
            .bucket(&config.bucket_name)
            .key(&input.url)
            .send()
            .await
            .map_err(|_| async_graphql::Error::new("Upload not found in storage"))?;

        let photo = sqlx::query_as!(
            Photo,
            r#"INSERT INTO photos (id, title, url, uploaded_by, created_at)
               VALUES ($1, $2, $3, $4, NOW())
               RETURNING id, title, url, uploaded_by, created_at"#,
            input.id, input.title, input.url, input.uploaded_by,
        )
        .fetch_one(pool)
        .await?;

        let _ = sender.send(PhotoAdded {
            id: photo.id,
            title: photo.title.clone(),
            url: photo.url.clone(),
            uploaded_by: photo.uploaded_by,
            created_at: photo.created_at,
        });

        Ok(photo)
    }
}
```

### 2.3 Frontend: Upload Flow (Svelte)

```svelte
<!-- src/lib/components/PhotoUploader.svelte -->
<script lang="ts">
  import { graphql } from '$lib/graphql/client';

  const REQUEST_UPLOAD = `
    mutation RequestUpload($input: RequestUploadInput!) {
      requestPhotoUpload(input: $input) {
        uploadId
        uploadUrl
        objectKey
      }
    }
  `;

  const CONFIRM_UPLOAD = `
    mutation ConfirmUpload($input: ConfirmPhotoInput!) {
      confirmPhotoUpload(input: $input) {
        id
        title
        url
      }
    }
  `;

  let file: File | null = $state(null);
  let uploading = $state(false);
  let progress = $state(0);
  let error = $state('');

  async function handleUpload() {
    if (!file) return;
    uploading = true;
    error = '';

    try {
      // Step 1: Get presigned URL
      const uploadResult = await graphql.request(REQUEST_UPLOAD, {
        input: {
          filename: file.name,
          contentType: file.type,
          galleryId: 'current-gallery-uuid',
        },
      });

      const { uploadId, uploadUrl, objectKey } = uploadResult.requestPhotoUpload;

      // Step 2: Upload directly to S3
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!response.ok) {
        throw new Error(`S3 upload failed: ${response.status}`);
      }

      // Step 3: Confirm with backend
      const photoUrl = `/cdn/${objectKey}`;
      await graphql.request(CONFIRM_UPLOAD, {
        input: {
          id: uploadId,
          title: file.name.replace(/\.[^.]+$/, ''),
          url: photoUrl,
          uploadedBy: 'current-user-uuid',
        },
      });

      file = null;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Upload failed';
    } finally {
      uploading = false;
    }
  }
</script>

<div class="uploader">
  <input
    type="file"
    accept="image/*"
    onchange={(e) => { file = e.target.files?.[0] ?? null; }}
    disabled={uploading}
  />
  <button onclick={handleUpload} disabled={!file || uploading}>
    {uploading ? 'Uploading...' : 'Upload Photo'}
  </button>
  {#if error}
    <p class="error">{error}</p>
  {/if}
</div>
```

### 2.4 Upload Progress with XMLHttpRequest

For progress tracking, replace `fetch` with `XMLHttpRequest`:

```typescript
// src/lib/upload.ts
export function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    });

    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.send(file);
  });
}
```

### 2.5 S3 CORS Configuration

The S3 bucket must allow CORS from the frontend origin:

```json
[
  {
    "AllowedHeaders": ["Content-Type", "Authorization"],
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": ["http://localhost:5173", "https://your-app.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 3. Type Sharing Between Rust and Svelte

### 3.1 Strategy: Schema-First Code Generation

The most maintainable approach is to export the GraphQL schema from Rust and generate TypeScript types from it. This avoids manual duplication and keeps both sides in sync.

**Flow:**
```
Rust schema definition
  → schema.sdl() (async-graphql introspection)
  → schema.graphql (SDL file, committed to repo)
  → graphql-codegen (TypeScript code generation)
  → generated TypeScript types
  → Svelte components import types
```

### 3.2 Backend: Export Schema SDL

```rust
// src/bin/export_schema.rs
use crate::graphql::schema::create_schema;

fn main() {
    let state = AppState::new_for_schema_export();
    let schema = create_schema(state);
    println!("{}", schema.sdl());
}
```

Add to `Cargo.toml`:

```toml
[[bin]]
name = "export_schema"
path = "src/bin/export_schema.rs"
```

Run: `cargo run --bin export_schema > frontend/schema.graphql`

### 3.3 Frontend: Code Generation Setup

```bash
cd frontend
npm install -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations
```

```yaml
# frontend/codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: './schema.graphql',
  documents: ['src/**/*.svelte', 'src/**/*.ts', '!src/graphql/types.ts'],
  generates: {
    'src/lib/graphql/types.ts': {
      plugins: ['typescript', 'typescript-operations'],
      config: {
        enumsAsTypes: true,
        immutableTypes: true,
        skipTypename: false,
        scalars: {
          DateTime: 'string',
          UUID: 'string',
          Upload: 'File',
        },
      },
    },
  },
};

export default config;
```

```json
// frontend/package.json (scripts section)
{
  "scripts": {
    "codegen": "graphql-codegen --config codegen.ts",
    "codegen:watch": "graphql-codegen --config codegen.ts --watch",
    "schema:export": "cd ../backend && cargo run --bin export_schema > ../frontend/schema.graphql"
  }
}
```

### 3.4 Generated Types Example

After running `npm run codegen`, you get:

```typescript
// src/lib/graphql/types.ts (auto-generated — DO NOT EDIT)
export type PhotoAdded = {
  __typename: 'PhotoAdded';
  id: string;
  title: string;
  url: string;
  uploadedBy: string;
  createdAt: string;
};

export type RequestUploadInput = {
  filename: string;
  contentType: string;
  galleryId: string;
};

export type PresignedUpload = {
  __typename: 'PresignedUpload';
  uploadId: string;
  uploadUrl: string;
  objectKey: string;
};

export type ConfirmPhotoInput = {
  id: string;
  title: string;
  url: string;
  uploadedBy: string;
};

export type Photo = {
  __typename: 'Photo';
  id: string;
  title: string;
  url: string;
  uploadedBy: string;
  createdAt: string;
};

export type SubscriptionPhotoAddedArgs = {};
export type OnPhotoAddedSubscription = { photoAdded: PhotoAdded };
export type RequestPhotoUploadMutation = { requestPhotoUpload: PresignedUpload };
export type ConfirmPhotoUploadMutation = { confirmPhotoUpload: Photo };
```

### 3.5 Rust Scalar ↔ TypeScript Mapping Reference

| Rust Type | async-graphql Scalar | TypeScript Type |
|-----------|---------------------|-----------------|
| `uuid::Uuid` | `UUID` (built-in) | `string` |
| `chrono::DateTime<Utc>` | `DateTime` (built-in) | `string` (ISO 8601) |
| `i32` | `Int` | `number` |
| `i64` | custom `StringInt` | `string` (avoid JS precision loss) |
| `f64` | `Float` | `number` |
| `bool` | `Boolean` | `boolean` |
| `String` | `String` | `string` |
| `Vec<T>` | `[T!]!` | `readonly T[]` |
| `Option<T>` | `T` (nullable) | `T \| null` |
| `async_graphql::Upload` | `Upload` | `File` (browser) |

### 3.6 Custom Scalar Registration (Rust)

For types not built into async-graphql, register them in the schema builder:

```rust
// src/graphql/scalars.rs
use async_graphql::*;

// UUID is built-in with the "uuid" feature, but for custom types:
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Json(pub serde_json::Value);

scalar!(Json, "JSON", "Arbitrary JSON");

// For i64 that must survive JS precision limits:
pub struct StringInt(pub i64);

#[Scalar]
impl ScalarType for StringInt {
    fn parse(value: Value) -> InputValueResult<Self> {
        match value {
            Value::String(s) => s.parse::<i64>()
                .map(StringInt)
                .map_err(InputValueError::custom),
            other => Err(InputValueError::expected_type(other)),
        }
    }
    fn to_value(&self) -> Value {
        Value::String(self.0.to_string())
    }
}
```

Register in schema builder:

```rust
Schema::build(Query, Mutation, Subscription)
    .register_type::<StringInt>()
    .register_type::<Json>()
    .data(pool)
    .finish()
```

---

## 4. Database Layer (sqlx + PostgreSQL)

### 4.1 Connection Pooling

```rust
// src/state.rs
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use aws_sdk_s3::Client as S3Client;

pub struct AppState {
    pub db_pool: PgPool,
    pub s3_client: S3Client,
    pub s3_bucket: String,
}

impl AppState {
    pub async fn new() -> Self {
        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL must be set");

        let pool = PgPoolOptions::new()
            .max_connections(20)
            .min_connections(5)
            .acquire_timeout(std::time::Duration::from_secs(5))
            .idle_timeout(std::time::Duration::from_secs(600))
            .connect(&database_url)
            .await
            .expect("Failed to create pool");

        let s3_config = aws_sdk_s3::Config::builder()
            .region(aws_sdk_s3::Region::new(
                std::env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".into())
            ))
            .build();

        let s3_client = S3Client::from_conf(s3_config);
        let s3_bucket = std::env::var("S3_BUCKET").expect("S3_BUCKET must be set");

        Self { db_pool: pool, s3_client, s3_bucket }
    }
}
```

### 4.2 Migration (Photos Table)

```sql
-- migrations/001_create_photos.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE photos (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title       TEXT NOT NULL,
    url         TEXT NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_photos_gallery ON photos(uploaded_by, created_at DESC);
```

---

## 5. GraphQL Client Setup (Svelte)

### 5.1 HTTP Client for Queries/Mutations

```typescript
// src/lib/graphql/client.ts
import { browser } from '$app/environment';

const GRAPHQL_ENDPOINT = '/graphql';

interface GraphQLError {
  message: string;
  extensions?: Record<string, unknown>;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

class GraphQLClient {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async request<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (browser) {
      const token = localStorage.getItem('auth_token');
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    const result: GraphQLResponse<T> = await response.json();

    if (result.errors?.length) {
      throw new Error(result.errors.map((e) => e.message).join(', '));
    }

    return result.data as T;
  }
}

export const graphql = new GraphQLClient(GRAPHQL_ENDPOINT);
```

### 5.2 SvelteKit Proxy (Development)

To avoid CORS during development, proxy `/graphql` and `/ws` to the Rust backend:

```typescript
// svelte.config.js
import adapter from '@sveltejs/adapter-node';

export default {
  kit: {
    adapter: adapter(),
    vite: {
      server: {
        proxy: {
          '/graphql': 'http://localhost:8000',
          '/ws': {
            target: 'ws://localhost:8000',
            ws: true,
          },
        },
      },
    },
  },
};
```

---

## 6. CI Pipeline: Type Sync

```yaml
# .github/workflows/type-sync.yml
name: Type Sync

on:
  push:
    paths: ['backend/src/**']

jobs:
  sync-types:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Export GraphQL Schema
        run: cd backend && cargo run --bin export_schema > ../frontend/schema.graphql

      - name: Install Frontend Dependencies
        run: cd frontend && npm ci

      - name: Generate TypeScript Types
        run: cd frontend && npm run codegen

      - name: Check for Changes
        run: |
          cd frontend
          if git diff --quiet src/lib/graphql/types.ts; then
            echo "Types are up to date"
          else
            echo "::error::Type definitions are out of sync. Run 'npm run schema:export && npm run codegen' locally."
            exit 1
          fi
```

---

## 7. Key Architecture Decisions

### Why Presigned URLs Instead of Direct Upload Through GraphQL?

| Concern | Direct Upload | Presigned URL |
|---------|--------------|---------------|
| Server load | Binary data flows through Actix | Server only handles metadata |
| Latency | Double hop (client→server→S3) | Single hop (client→S3) |
| Timeout risk | Large files may exceed GraphQL timeout | S3 handles upload timeouts |
| Cost | Egress bandwidth through your server | Direct S3 egress only |
| Progress tracking | Requires custom streaming | Native XHR progress events |

### Why `graphql-ws` Protocol Over `subscriptions-transport-ws`?

`async-graphql`'s Actix integration uses the `graphql-transport-ws` protocol (the newer `graphql-ws` spec). The older `subscriptions-transport-ws` protocol is deprecated. The `graphql-ws` npm package implements the correct protocol.

### Why Schema-First Code Generation Over `ts-rs` or `specta`?

- **Single source of truth**: The GraphQL schema is the contract. Both Rust and TypeScript derive from it.
- **No Rust→TypeScript mapping drift**: Codegen reads the actual SDL, so any schema change is reflected in TS types.
- **Works with any frontend**: The same `schema.graphql` can generate types for Swift, Kotlin, etc.
- **`ts-rs`/`specta`** generate from Rust structs, which can diverge from the GraphQL schema if you forget to update one side.

### Why `broadcast` Channel Over `tokio::sync::watch`?

- `broadcast` allows multiple subscribers (N clients watching the gallery).
- `watch` only keeps the latest value — new subscribers miss prior events, which is wrong for a photo feed.
- `broadcast::Sender::send()` is non-blocking; it drops messages for slow receivers rather than backpressuring the mutation.

---

## 8. Error Handling Patterns

### Backend: Structured GraphQL Errors

```rust
// src/graphql/errors.rs
use async_graphql::Error;

pub fn not_found(resource: &str, id: &str) -> Error {
    Error::new(format!("{} '{}' not found", resource, id))
}

pub fn unauthorized(action: &str) -> Error {
    Error::new(format!("Not authorized to {}", action))
        .extend_with(|_, e| e.set("code", "UNAUTHORIZED"))
}

pub fn upload_failed(reason: &str) -> Error {
    Error::new(format!("Upload failed: {}", reason))
        .extend_with(|_, e| e.set("code", "UPLOAD_FAILED"))
}
```

### Frontend: Typed Error Handling

```typescript
// src/lib/graphql/errors.ts
import type { GraphQLError } from 'graphql';

export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public extensions?: Record<string, unknown>
  ) {
    super(message);
  }
}

export function parseGraphQLErrors(errors: readonly GraphQLError[]): AppError {
  const first = errors[0];
  return new AppError(
    first.message,
    first.extensions?.code as string,
    first.extensions as Record<string, unknown>
  );
}
```

---

## 9. Testing Patterns

### Backend: Subscription Testing

```rust
// tests/subscriptions_test.rs
use async_graphql::{Schema, EmptyMutation};
use crate::graphql::{GalleryQuery, GallerySubscription, subscriptions::PhotoEventSender};
use tokio::sync::broadcast;
use futures_util::StreamExt;

#[tokio::test]
async fn test_photo_added_subscription() {
    let (sender, _) = broadcast::channel(256);
    let schema = Schema::build(
        GalleryQuery::default(),
        EmptyMutation,
        GallerySubscription::default(),
    )
    .data(sender.clone())
    .finish();

    let mut stream = schema
        .subscribe(
            async_graphql::Request::new("subscription { photoAdded { id title } }")
        )
        .await
        .unwrap();

    // Simulate a photo being added
    sender.send(PhotoAdded {
        id: uuid::Uuid::new_v4(),
        title: "Test Photo".into(),
        url: "https://cdn.example.com/test.jpg".into(),
        uploaded_by: uuid::Uuid::new_v4(),
        created_at: chrono::Utc::now(),
    }).unwrap();

    let response = stream.next().await.unwrap();
    assert_eq!(response.data.to_string().contains("Test Photo"), true);
}
```

### Frontend: Mock Subscription Testing

```typescript
// src/lib/graphql/__tests__/subscription.test.ts
import { describe, it, expect, vi } from 'vitest';
import { subscribeToPhotos } from '../subscription';

describe('subscribeToPhotos', () => {
  it('calls onNext when a photo event is received', async () => {
    const mockClient = {
      subscribe: vi.fn().mockImplementation((_req, sink) => {
        sink.next({ data: { photoAdded: { id: '1', title: 'Test' } } });
        return () => {};
      }),
    };

    // Inject mock client
    const onNext = vi.fn();
    const unsub = subscribeToPhotos(onNext, vi.fn());
    // In real tests, you'd inject the client via dependency injection
  });
});
```

---

## 10. Production Checklist

- [ ] **WebSocket auth**: Validate JWT in `connectionParams` on the server side via a custom `async-graphql` data loader or Actix middleware
- [ ] **Subscription cleanup**: Ensure `broadcast::Receiver` is dropped when WebSocket disconnects (async-graphql handles this automatically)
- [ ] **S3 presigned URL expiry**: Set to 15 min; client must upload within that window
- [ ] **S3 object validation**: `confirmPhotoUpload` should `HeadObject` the S3 key before inserting into DB
- [ ] **Connection pool sizing**: `max_connections` should match your expected concurrent request count (rule of thumb: 2× CPU cores)
- [ ] **CORS**: Configure Actix CORS middleware for the GraphQL endpoint
- [ ] **Rate limiting**: Add rate limiting on `requestPhotoUpload` to prevent abuse
- [ ] **File type validation**: Verify `content_type` starts with `image/` before generating presigned URL
- [ ] **File size limit**: Set S3 bucket policy or pre-check content-length before upload
- [ ] **Schema versioning**: Include schema hash in CI to detect breaking changes
- [ ] **Graceful shutdown**: Drain WebSocket connections before shutting down Actix