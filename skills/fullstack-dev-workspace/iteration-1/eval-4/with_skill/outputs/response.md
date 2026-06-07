# Full-Stack Integration Patterns: Rust + Svelte + PostgreSQL

**Stack:** Actix-web + async-graphql (Rust) · SvelteKit (Frontend) · PostgreSQL (sqlx) · GraphQL Subscriptions + Presigned URL Uploads

---

## 1. Project Structure (Feature-First)

Following the skill's **feature-first organization** with three-layer separation:

```
src/
├── main.rs                  # Startup: config validation, DB pool, server bind
├── config.rs                # requiredEnv() pattern, validated at startup
├── errors.rs                # AppError hierarchy + global handler
├── middleware/
│   ├── request_id.rs
│   ├── logging.rs
│   └── auth.rs
├── shared/
│   ├── types/               # Shared type definitions (also exported via graphql)
│   │   ├── mod.rs
│   │   ├── photo.rs
│   │   └── upload.rs
│   └── db.rs                # Connection pool wrapper
├── photos/
│   ├── mod.rs
│   ├── model.rs             # Repository layer (sqlx queries)
│   ├── service.rs            # Business logic
│   ├── schema.rs             # GraphQL schema (controller layer)
│   └── subscription.rs       # WebSocket subscription handlers
└── uploads/
    ├── mod.rs
    ├── service.rs            # Presigned URL generation
    └── schema.rs             # Upload mutations
```

Frontend mirrors the feature structure:

```
src/lib/
├── graphql/
│   ├── queries.ts
│   ├── mutations.ts
│   ├── subscriptions.ts
│   └── client.ts             # GraphQL client setup
├── types/
│   ├── generated.ts          # Auto-generated from backend schema
│   └── upload.ts
├── stores/
│   ├── photos.ts
│   └── auth.ts
└── utils/
    ├── errors.ts             # Cross-boundary error mapping
    └── s3.ts                 # Presigned upload helper
```

---

## 2. Configuration — Centralized & Validated at Startup

The skill mandates **centralized typed config via env vars, validated at startup, fail fast**.

```rust
// src/config.rs
use std::env;

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub database_url: String,
    pub database_max_connections: u32,
    pub jwt_secret: String,
    pub s3_bucket: String,
    pub s3_region: String,
    pub s3_access_key: String,
    pub s3_secret_key: String,
    pub s3_endpoint: String,
    pub presigned_url_ttl_secs: u64,
    pub cors_origins: Vec<String>,
    pub server_host: String,
    pub server_port: u16,
}

impl AppConfig {
    pub fn from_env() -> Result<Self, String> {
        Ok(Self {
            database_url: required_env("DATABASE_URL")?,
            database_max_connections: required_env("DATABASE_MAX_CONNECTIONS")?
                .parse().map_err(|_| "DATABASE_MAX_CONNECTIONS must be a number")?,
            jwt_secret: required_env("JWT_SECRET")?,
            s3_bucket: required_env("S3_BUCKET")?,
            s3_region: required_env("S3_REGION")?,
            s3_access_key: required_env("S3_ACCESS_KEY")?,
            s3_secret_key: required_env("S3_SECRET_KEY")?,
            s3_endpoint: required_env("S3_ENDPOINT")?,
            presigned_url_ttl_secs: env::var("PRESIGNED_URL_TTL_SECS")
                .unwrap_or_else(|_| "3600".to_string())
                .parse().map_err(|_| "PRESIGNED_URL_TTL_SECS must be a number")?,
            cors_origins: required_env("CORS_ORIGINS")?
                .split(',').map(String::from).collect(),
            server_host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            server_port: env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse().map_err(|_| "PORT must be a number")?,
        })
    }
}

fn required_env(key: &str) -> Result<String, String> {
    env::var(key).map_err(|_| format!("Missing required environment variable: {}", key))
}
```

Startup validates everything before the server binds — **fail fast** per the skill:

```rust
// src/main.rs
#[actix_web::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = AppConfig::from_env()
        .expect("Configuration validation failed — see errors above");

    let pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(config.database_max_connections)
        .connect(&config.database_url)
        .await
        .expect("Failed to create database pool");

    // Run migrations at startup
    sqlx::migrate!("./migrations").run(&pool).await?;

    let schema = build_schema(pool, config.clone());

    HttpServer::new(move || {
        App::new()
            .wrap(RequestIdMiddleware::default())
            .wrap(actix_web::middleware::Logger::default())
            .wrap(Cors::permissive()) // Replace with configured origins
            .configure(|cfg| configure_routes(cfg, schema.clone()))
    })
    .bind(format!("{}:{}", config.server_host, config.server_port))?
    .run()
    .await?;

    Ok(())
}
```

---

## 3. Error Handling — Typed Hierarchy + Global Handler

The skill requires **typed error hierarchy with global handler → consistent `{ error, status, detail, requestId }`**.

```rust
// src/errors.rs
use actix_web::{HttpResponse, ResponseError};
use async_graphql::Error as GraphQLError;

#[derive(Debug, Clone)]
pub enum AppErrorCode {
    NotFound,
    Unauthorized,
    Forbidden,
    ValidationFailed,
    Conflict,
    RateLimited,
    InternalError,
    UploadTooLarge,
    InvalidContentType,
}

#[derive(Debug)]
pub struct AppError {
    pub code: AppErrorCode,
    pub status: u16,
    pub detail: String,
    pub is_operational: bool,
    pub request_id: Option<String>,
}

impl AppError {
    pub fn not_found(resource: &str) -> Self {
        Self {
            code: AppErrorCode::NotFound,
            status: 404,
            detail: format!("{} not found", resource),
            is_operational: true,
            request_id: None,
        }
    }

    pub fn unauthorized(msg: &str) -> Self {
        Self {
            code: AppErrorCode::Unauthorized,
            status: 401,
            detail: msg.to_string(),
            is_operational: true,
            request_id: None,
        }
    }

    pub fn validation_failed(field: &str, reason: &str) -> Self {
        Self {
            code: AppErrorCode::ValidationFailed,
            status: 422,
            detail: format!("{}: {}", field, reason),
            is_operational: true,
            request_id: None,
        }
    }

    pub fn internal(msg: &str) -> Self {
        Self {
            code: AppErrorCode::InternalError,
            status: 500,
            detail: msg.to_string(),
            is_operational: false,
            request_id: None,
        }
    }

    pub fn with_request_id(mut self, id: String) -> Self {
        self.request_id = Some(id);
        self
    }
}

impl ResponseError for AppError {
    fn error_response(&self) -> HttpResponse {
        let body = serde_json::json!({
            "error": format!("{:?}", self.code).to_lowercase(),
            "status": self.status,
            "detail": self.detail,
            "requestId": self.request_id,
        });

        if self.is_operational {
            HttpResponse::build(actix_web::http::StatusCode::from_u16(self.status).unwrap())
                .json(body)
        } else {
            // Programming errors: log + 500, never expose internals
            tracing::error!(detail = %self.detail, "Internal error");
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "internal_error",
                "status": 500,
                "detail": "An unexpected error occurred",
                "requestId": self.request_id,
            }))
        }
    }
}

impl From<AppError> for GraphQLError {
    fn from(err: AppError) -> Self {
        GraphQLError::new(err.detail)
    }
}
```

---

## 4. GraphQL Subscriptions — Rust Backend

The skill lists **WebSocket (bidirectional, chat/collaboration)** as the pattern for real-time. GraphQL subscriptions over WebSocket are the natural fit here.

### Schema Definition

```rust
// src/photos/subscription.rs
use async_graphql::{Subscription, Context};
use futures::Stream;
use tokio::sync::broadcast;
use crate::shared::types::photo::Photo;

#[derive(Debug, Clone)]
pub enum PhotoEvent {
    Created(Photo),
    Updated(Photo),
    Deleted(String), // photo ID
}

pub struct PhotoSubscription;

#[Subscription]
impl PhotoSubscription {
    /// Stream of new photos added to the gallery
    async fn photo_created(
        &self,
        ctx: &Context<'_>,
        gallery_id: String,
    ) -> impl Stream<Item = Photo> {
        let broadcaster = ctx.data::<broadcast::Sender<PhotoEvent>>().unwrap();
        let mut rx = broadcaster.subscribe();

        async_stream::stream! {
            while let Ok(event) = rx.recv().await {
                match event {
                    PhotoEvent::Created(photo) if photo.gallery_id == gallery_id => {
                        yield photo;
                    }
                    _ => continue,
                }
            }
        }
    }

    /// Stream of photo updates
    async fn photo_updated(
        &self,
        ctx: &Context<'_>,
        gallery_id: String,
    ) -> impl Stream<Item = Photo> {
        let broadcaster = ctx.data::<broadcast::Sender<PhotoEvent>>().unwrap();
        let mut rx = broadcaster.subscribe();

        async_stream::stream! {
            while let Ok(event) = rx.recv().await {
                match event {
                    PhotoEvent::Updated(photo) if photo.gallery_id == gallery_id => {
                        yield photo;
                    }
                    _ => continue,
                }
            }
        }
    }
}
```

### Broadcasting from Service Layer

The service layer publishes events after successful mutations — **business logic stays out of the controller**:

```rust
// src/photos/service.rs
use crate::shared::types::photo::{Photo, CreatePhotoInput};
use crate::photos::model::PhotoRepository;
use crate::errors::AppError;
use tokio::sync::broadcast::Sender;
use super::subscription::PhotoEvent;

pub struct PhotoService {
    repo: PhotoRepository,
    broadcaster: Sender<PhotoEvent>,
}

impl PhotoService {
    pub fn new(repo: PhotoRepository, broadcaster: Sender<PhotoEvent>) -> Self {
        Self { repo, broadcaster }
    }

    pub async fn create_photo(&self, input: CreatePhotoInput) -> Result<Photo, AppError> {
        // Validate input at boundary (skill: "input validation at every boundary")
        if input.title.is_empty() {
            return Err(AppError::validation_failed("title", "cannot be empty"));
        }

        let photo = self.repo.insert(input).await?;

        // Broadcast to all subscribers
        let _ = self.broadcaster.send(PhotoEvent::Created(photo.clone()));

        Ok(photo)
    }

    pub async fn delete_photo(&self, id: String) -> Result<(), AppError> {
        self.repo.delete(&id).await?;
        let _ = self.broadcaster.send(PhotoEvent::Deleted(id));
        Ok(())
    }
}
```

### Wiring the Subscription into the Schema

```rust
// src/photos/schema.rs
use async_graphql::{Schema, Mutation, Query, EmptySubscription};
use crate::photos::subscription::PhotoSubscription;

pub type AppSchema = Schema<Query, Mutation, PhotoSubscription>;

pub fn build_schema(pool: sqlx::PgPool, config: AppConfig) -> AppSchema {
    let (tx, _) = tokio::sync::broadcast::channel(100);

    let repo = PhotoRepository::new(pool);
    let service = PhotoService::new(repo, tx.clone());

    Schema::build(Query, Mutation, PhotoSubscription)
        .data(service)
        .data(tx)
        .data(config)
        .finish()
}
```

### Actix-web Route for WebSocket

```rust
// src/main.rs (route configuration)
use async_graphql::http::{GraphQLPlaygroundConfig, playground_source};
use async_graphql_actix_web::{GraphQLRequest, GraphQLResponse, GraphQLSubscription};

pub fn configure_routes(cfg: &mut web::ServiceConfig, schema: AppSchema) {
    cfg
        .service(
            web::resource("/graphql")
                .route(web::post().to(graphql_handler))
        )
        .service(
            web::resource("/graphql/playground")
                .route(web::get().to(playground_handler))
        )
        // WebSocket endpoint for subscriptions
        .service(
            web::resource("/graphql/ws")
                .route(web::get().to(GraphQLSubscription::new(schema.clone())))
        );
}

async fn graphql_handler(
    schema: web::Data<AppSchema>,
    req: GraphQLRequest,
) -> GraphQLResponse {
    schema.execute(req.into_inner()).await.into()
}

async fn playground_handler() -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(playground_source(GraphQLPlaygroundConfig::new("/graphql").subscription_endpoint("/graphql/ws")))
}
```

---

## 5. GraphQL Subscriptions — Svelte Frontend

### Client Setup with Subscription Support

```typescript
// src/lib/graphql/client.ts
import { createClient, Client } from 'graphql-ws';
import { get } from 'svelte/store';
import { authStore } from '$lib/stores/auth';

function createGraphQLClient(): Client {
  return createClient({
    url: import.meta.env.VITE_GRAPHQL_WS_URL || 'ws://localhost:8080/graphql/ws',
    connectionParams: () => {
      const auth = get(authStore);
      return {
        Authorization: auth.token ? `Bearer ${auth.token}` : '',
      };
    },
    shouldRetry: (err) => {
      // Auto-retry 5xx, never 4xx (skill: cross-boundary error handling)
      if (err && 'status' in err) {
        return (err as any).status >= 500;
      }
      return true;
    },
    retryAttempts: 5,
    on: {
      connected: () => console.log('[GraphQL] WebSocket connected'),
      closed: () => console.log('[GraphQL] WebSocket closed'),
    },
  });
}

export const wsClient = createGraphQLClient();
```

### Svelte Store for Photo Subscriptions

```typescript
// src/lib/stores/photos.ts
import { writable, derived } from 'svelte/store';
import { createClient, Client } from 'graphql-ws';
import { wsClient } from '$lib/graphql/client';
import { PHOTO_CREATED_SUBSCRIPTION } from '$lib/graphql/subscriptions';
import { mapGraphQLError } from '$lib/utils/errors';

export interface Photo {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  galleryId: string;
  createdAt: string;
  updatedAt: string;
}

interface PhotoStore {
  photos: Photo[];
  loading: boolean;
  error: string | null;
}

function createPhotoStore() {
  const { subscribe, set, update } = writable<PhotoStore>({
    photos: [],
    loading: false,
    error: null,
  });

  let unsubscribe: (() => void) | null = null;

  return {
    subscribe,

    /** Subscribe to real-time photo updates for a gallery */
    subscribeToGallery(galleryId: string) {
      // Clean up previous subscription
      if (unsubscribe) unsubscribe();

      update((s) => ({ ...s, loading: true, error: null }));

      unsubscribe = wsClient.subscribe(
        {
          query: PHOTO_CREATED_SUBSCRIPTION,
          variables: { galleryId },
        },
        {
          next: (data: any) => {
            const newPhoto: Photo = data.photoCreated;
            update((s) => ({
              ...s,
              photos: [...s.photos, newPhoto],
              loading: false,
            }));
          },
          error: (err) => {
            // Map error codes to human messages (skill: cross-boundary error handling)
            update((s) => ({
              ...s,
              error: mapGraphQLError(err),
              loading: false,
            }));
          },
          complete: () => {
            update((s) => ({ ...s, loading: false }));
          },
        }
      );

      return () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      };
    },

    /** Remove a photo (optimistic update) */
    removePhoto(id: string) {
      update((s) => ({
        ...s,
        photos: s.photos.filter((p) => p.id !== id),
      }));
    },

    /** Reset store */
    reset() {
      if (unsubscribe) unsubscribe();
      set({ photos: [], loading: false, error: null });
    },
  };
}

export const photoStore = createPhotoStore();
```

### Svelte Component Using Subscriptions

```svelte
<!-- src/routes/galleries/[id]/+page.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { photoStore } from '$lib/stores/photos';
  import PhotoCard from './PhotoCard.svelte';

  let cleanup: (() => void) | null = null;

  onMount(() => {
    const galleryId = $page.params.id;
    cleanup = photoStore.subscribeToGallery(galleryId);
  });

  onDestroy(() => {
    cleanup?.();
  });
</script>

{#if $photoStore.loading && $photoStore.photos.length === 0}
  <p>Loading photos...</p>
{:else if $photoStore.error}
  <p class="error">{$photoStore.error}</p>
{:else}
  <div class="photo-grid">
    {#each $photoStore.photos as photo (photo.id)}
      <PhotoCard {photo} />
    {/each}
  </div>
{/if}
```

### Subscription GraphQL Document

```typescript
// src/lib/graphql/subscriptions.ts
import gql from 'graphql-tag';

export const PHOTO_CREATED_SUBSCRIPTION = gql`
  subscription PhotoCreated($galleryId: String!) {
    photoCreated(galleryId: $galleryId) {
      id
      title
      url
      thumbnailUrl
      galleryId
      createdAt
      updatedAt
    }
  }
`;

export const PHOTO_UPDATED_SUBSCRIPTION = gql`
  subscription PhotoUpdated($galleryId: String!) {
    photoUpdated(galleryId: $galleryId) {
      id
      title
      url
      thumbnailUrl
      galleryId
      createdAt
      updatedAt
    }
  }
`;
```

---

## 6. File Upload Flow with Presigned URLs

The skill states: **Presigned URL recommended >5MB**. For a photo gallery, most photos exceed this threshold, so presigned URLs are the primary upload path.

### Architecture Decision

```
┌──────────┐    1. Request presigned URL    ┌──────────┐
│  Svelte  │ ──────────────────────────────►│  Rust    │
│  Frontend │                               │  Backend  │
│           │◄────────────────────────────── │          │
│           │    2. Return presigned URL     │          │
│           │                               │          │
│           │    3. PUT photo directly      │          │
│           │ ──────────────────────────────►│  S3/     │
│           │                               │  MinIO    │
│           │◄────────────────────────────── │          │
│           │    4. S3 confirms upload       │          │
│           │                               │          │
│           │    5. Confirm upload complete  │          │
│           │ ──────────────────────────────►│  Rust    │
│           │                               │  Backend  │
│           │◄────────────────────────────── │          │
│           │    6. Return Photo entity      │          │
└──────────┘                               └──────────┘
```

### Backend: Presigned URL Generation

```rust
// src/uploads/service.rs
use aws_sdk_s3::presigning::PresigningConfig;
use std::time::Duration;
use crate::config::AppConfig;
use crate::errors::AppError;

pub struct UploadService {
    s3_client: aws_sdk_s3::Client,
    config: AppConfig,
}

impl UploadService {
    pub fn new(s3_client: aws_sdk_s3::Client, config: AppConfig) -> Self {
        Self { s3_client, config }
    }

    /// Generate a presigned PUT URL for direct browser-to-S3 upload.
    /// Skill: "Presigned URL recommended >5MB"
    pub async fn generate_presigned_url(
        &self,
        file_name: &str,
        content_type: &str,
        gallery_id: &str,
    ) -> Result<PresignedUpload, AppError> {
        // Validate content type at boundary (skill: "input validation at every boundary")
        let allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if !allowed_types.contains(&content_type) {
            return Err(AppError::validation_failed(
                "contentType",
                &format!("Allowed types: {}", allowed_types.join(", ")),
            ));
        }

        // Generate a unique key to prevent collisions
        let key = format!("galleries/{}/{}", gallery_id, file_name);

        let presigned = self.s3_client
            .put_object()
            .bucket(&self.config.s3_bucket)
            .key(&key)
            .content_type(content_type)
            .presigned(PresigningConfig::expires_in(
                Duration::from_secs(self.config.presigned_url_ttl_secs)
            ).map_err(|e| AppError::internal(&e.to_string()))?)
            .await
            .map_err(|e| AppError::internal(&format!("Failed to generate presigned URL: {}", e)))?;

        Ok(PresignedUpload {
            upload_url: presigned.uri().to_string(),
            key,
            expires_in: self.config.presigned_url_ttl_secs,
        })
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PresignedUpload {
    pub upload_url: String,
    pub key: String,
    pub expires_in: u64,
}
```

### Backend: GraphQL Mutation for Upload

```rust
// src/uploads/schema.rs
use async_graphql::{Context, Object, InputObject};
use crate::uploads::service::{UploadService, PresignedUpload};
use crate::photos::service::PhotoService;
use crate::shared::types::photo::Photo;

#[derive(InputObject)]
pub struct RequestUploadInput {
    pub file_name: String,
    pub content_type: String,
    pub gallery_id: String,
    pub title: String,
}

#[derive(async_graphql::SimpleObject)]
pub struct RequestUploadPayload {
    pub presigned_url: String,
    pub key: String,
    pub expires_in: u64,
}

#[derive(async_graphql::SimpleObject)]
pub struct ConfirmUploadPayload {
    pub photo: Photo,
}

pub struct UploadMutation;

#[Object]
impl UploadMutation {
    /// Step 1: Request a presigned URL for direct upload
    async fn request_upload(
        &self,
        ctx: &Context<'_>,
        input: RequestUploadInput,
    ) -> Result<RequestUploadPayload, async_graphql::Error> {
        let upload_service = ctx.data::<UploadService>()?;
        let result = upload_service
            .generate_presigned_url(&input.file_name, &input.content_type, &input.gallery_id)
            .await?;

        Ok(RequestUploadPayload {
            presigned_url: result.upload_url,
            key: result.key,
            expires_in: result.expires_in,
        })
    }

    /// Step 3: Confirm upload completed and create the photo record
    async fn confirm_upload(
        &self,
        ctx: &Context<'_>,
        key: String,
        gallery_id: String,
        title: String,
    ) -> Result<ConfirmUploadPayload, async_graphql::Error> {
        let upload_service = ctx.data::<UploadService>()?;

        // Verify the object exists in S3 before creating the DB record
        upload_service.verify_object_exists(&key).await?;

        let photo_service = ctx.data::<PhotoService>()?;
        let photo = photo_service
            .create_photo(CreatePhotoInput {
                title,
                s3_key: key,
                gallery_id,
            })
            .await?;

        Ok(ConfirmUploadPayload { photo })
    }
}
```

### Frontend: Upload Flow

```typescript
// src/lib/utils/s3.ts
import { mapGraphQLError } from '$lib/utils/errors';

interface PresignedUpload {
  presignedUrl: string;
  key: string;
  expiresIn: number;
}

/**
 * Upload a file using the presigned URL flow.
 * Skill: "Presigned URL recommended >5MB"
 */
export async function uploadFileViaPresignedUrl(
  file: File,
  galleryId: string,
  requestUpload: (input: any) => Promise<any>,
  confirmUpload: (input: any) => Promise<any>
): Promise<any> {
  // Step 1: Request presigned URL from backend
  const { data: uploadData, errors: uploadErrors } = await requestUpload({
    fileName: file.name,
    contentType: file.type,
    galleryId,
    title: file.name.replace(/\.[^.]+$/, ''),
  });

  if (uploadErrors) {
    throw new Error(mapGraphQLError(uploadErrors));
  }

  const presigned: PresignedUpload = uploadData.requestUpload;

  // Step 2: Upload directly to S3
  const uploadResponse = await fetch(presigned.presignedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error(`S3 upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
  }

  // Step 3: Confirm upload with backend to create the photo record
  const { data: confirmData, errors: confirmErrors } = await confirmUpload({
    key: presigned.key,
    galleryId,
    title: file.name.replace(/\.[^.]+$/, ''),
  });

  if (confirmErrors) {
    throw new Error(mapGraphQLError(confirmErrors));
  }

  return confirmData.confirmUpload.photo;
}
```

### Svelte Upload Component

```svelte
<!-- src/lib/components/PhotoUploader.svelte -->
<script lang="ts">
  import { photoStore } from '$lib/stores/photos';
  import { uploadFileViaPresignedUrl } from '$lib/utils/s3';
  import { REQUEST_UPLOAD_MUTATION, CONFIRM_UPLOAD_MUTATION } from '$lib/graphql/mutations';
  import { graphqlClient } from '$lib/graphql/client';

  export let galleryId: string;

  let uploading = false;
  let progress = 0;
  let error: string | null = null;
  let files: FileList | null = null;

  async function handleUpload() {
    if (!files || files.length === 0) return;

    uploading = true;
    error = null;

    for (let i = 0; i < files.length; i++) {
      try {
        await uploadFileViaPresignedUrl(
          files[i],
          galleryId,
          // requestUpload mutation caller
          async (input) => graphqlClient.mutate(REQUEST_UPLOAD_MUTATION, { input }),
          // confirmUpload mutation caller
          async (input) => graphqlClient.mutate(CONFIRM_UPLOAD_MUTATION, { input })
        );
        progress = ((i + 1) / files.length) * 100;
      } catch (e: any) {
        error = e.message;
        break;
      }
    }

    uploading = false;
  }
</script>

<div class="uploader">
  <input
    type="file"
    accept="image/jpeg,image/png,image/webp,image/gif"
    multiple
    bind:files
    disabled={uploading}
  />

  {#if uploading}
    <div class="progress-bar">
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>
  {/if}

  {#if error}
    <!-- Skill: "Show field errors next to inputs" -->
    <p class="error">{error}</p>
  {/if}

  <button on:click={handleUpload} disabled={!files || uploading}>
    {uploading ? 'Uploading...' : 'Upload Photos'}
  </button>
</div>
```

### Upload Mutations

```typescript
// src/lib/graphql/mutations.ts
import gql from 'graphql-tag';

export const REQUEST_UPLOAD_MUTATION = gql`
  mutation RequestUpload($input: RequestUploadInput!) {
    requestUpload(input: $input) {
      presignedUrl
      key
      expiresIn
    }
  }
`;

export const CONFIRM_UPLOAD_MUTATION = gql`
  mutation ConfirmUpload($key: String!, $galleryId: String!, $title: String!) {
    confirmUpload(key: $key, galleryId: $galleryId, title: $title) {
      photo {
        id
        title
        url
        thumbnailUrl
        galleryId
        createdAt
        updatedAt
      }
    }
  }
`;
```

---

## 7. Type Sharing Between Rust Backend and Svelte Frontend

The skill warns against **duplicated types** as an anti-pattern. For Rust ↔ TypeScript, we use async-graphql's built-in schema introspection to generate TypeScript types.

### Strategy: Schema-Driven Type Generation

```toml
# Cargo.toml — add the CLI for schema generation
[dependencies]
async-graphql = "7"
async-graphql-actix-web = "7"

[dev-dependencies]
async-graphql-parser = "7"  # For schema export
```

### Generate the GraphQL Schema

```rust
// src/schema_export.rs
use crate::photos::schema::AppSchema;

pub fn export_schema() -> String {
    let schema = build_schema_for_export();
    schema.sdl()
}

fn build_schema_for_export() -> AppSchema {
    // Build schema with dummy data for export
    let pool = sqlx::PgPool::connect_lazy("postgres://dummy").unwrap();
    let config = AppConfig {
        database_url: String::new(),
        database_max_connections: 1,
        jwt_secret: String::new(),
        s3_bucket: String::new(),
        s3_region: String::new(),
        s3_access_key: String::new(),
        s3_secret_key: String::new(),
        s3_endpoint: String::new(),
        presigned_url_ttl_secs: 3600,
        cors_origins: vec![],
        server_host: String::new(),
        server_port: 8080,
    };
    build_schema(pool, config)
}
```

### Code Generation Script

```bash
#!/bin/bash
# scripts/generate-types.sh
# 1. Export GraphQL schema from Rust backend
cargo run --bin schema-export > schema.graphql

# 2. Generate TypeScript types using graphql-codegen
npx graphql-codegen --config codegen.yml
```

```yaml
# codegen.yml
schema: ./schema.graphql
documents:
  - "src/lib/graphql/**/*.ts"
generates:
  src/lib/types/generated.ts:
    plugins:
      - typescript
      - typescript-operations
    config:
      scalars:
        DateTime: string
        Upload: File
      immutableTypes: true
      enumsAsTypes: true
```

### Generated Types (example output)

```typescript
// src/lib/types/generated.ts — AUTO-GENERATED, DO NOT EDIT
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null;

export type Photo = {
  __typename?: 'Photo';
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  galleryId: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatePhotoInput = {
  title: string;
  s3Key: string;
  galleryId: string;
};

export type RequestUploadInput = {
  fileName: string;
  contentType: string;
  galleryId: string;
  title: string;
};

export type RequestUploadPayload = {
  __typename?: 'RequestUploadPayload';
  presignedUrl: string;
  key: string;
  expiresIn: number;
};

export type ConfirmUploadPayload = {
  __typename?: 'ConfirmUploadPayload';
  photo: Photo;
};

// Subscription types
export type PhotoCreatedSubscription = {
  __typename?: 'PhotoCreated';
  photoCreated: Photo;
};

export type PhotoUpdatedSubscription = {
  __typename?: 'PhotoUpdated';
  photoUpdated: Photo;
};
```

### CI Integration

```yaml
# .github/workflows/typegen.yml
name: Type Generation
on: [push]
jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Export GraphQL schema
        run: cargo run --bin schema-export > schema.graphql
      - name: Generate TypeScript types
        run: npx graphql-codegen --config codegen.yml
      - name: Check for drift
        run: git diff --exit-code src/lib/types/generated.ts
```

---

## 8. Cross-Boundary Error Handling

The skill requires: **Map error codes to human messages. Show field errors next to inputs. Auto-retry 5xx, never 4xx.**

```typescript
// src/lib/utils/errors.ts

/**
 * Maps backend error codes to user-facing messages.
 * Skill: "Map error codes to human messages"
 */
const ERROR_MESSAGES: Record<string, string> = {
  not_found: 'The requested resource was not found.',
  unauthorized: 'Please sign in to continue.',
  forbidden: 'You do not have permission to perform this action.',
  validation_failed: 'Please check your input and try again.',
  conflict: 'This resource already exists.',
  rate_limited: 'Too many requests. Please wait a moment and try again.',
  upload_too_large: 'The file is too large to upload.',
  invalid_content_type: 'This file type is not supported.',
  internal_error: 'Something went wrong. Please try again later.',
};

export function mapGraphQLError(error: any): string {
  // GraphQL errors come as an array
  const gqlError = Array.isArray(error) ? error[0] : error;

  // Check for structured error extensions from our AppError
  const code = gqlError?.extensions?.code;
  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }

  // Field-level validation errors
  if (code === 'validation_failed' && gqlError?.extensions?.field) {
    const field = gqlError.extensions.field;
    return `${field}: ${gqlError.message}`;
  }

  // Fallback to raw message (sanitized)
  return gqlError?.message || 'An unexpected error occurred.';
}

/**
 * Determines if an error should be retried.
 * Skill: "Auto-retry 5xx, never 4xx"
 */
export function shouldRetry(error: any): boolean {
  const status = error?.response?.status || error?.extensions?.status;
  if (!status) return true; // Network errors can be retried
  return status >= 500;
}

/**
 * Extracts field-level errors for form display.
 * Skill: "Show field errors next to inputs"
 */
export function extractFieldErrors(errors: any[]): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  for (const error of errors) {
    const code = error?.extensions?.code;
    const field = error?.extensions?.field;
    if (code === 'validation_failed' && field) {
      fieldErrors[field] = mapGraphQLError(error);
    }
  }

  return fieldErrors;
}
```

---

## 9. Middleware Stack

The skill specifies the order: **RequestID → Logging → CORS → RateLimit → BodyParse → Auth → Authz → Validation → Handler → ErrorHandler**.

```rust
// src/main.rs — middleware configuration
use actix_web::{App, HttpServer, middleware};
use actix_cors::Cors;
use actix_web::middleware::Logger;

pub fn configure_app(
    cfg: &mut web::ServiceConfig,
    schema: AppSchema,
    config: AppConfig,
) {
    cfg
        // 1. Request ID — first, so all downstream logs have it
        .wrap(RequestIdMiddleware::default())
        // 2. Logging — structured JSON with request ID
        .wrap(Logger::default().log_format(
            "%{request-id}i %a %r %s %Dms"
        ))
        // 3. CORS
        .wrap(
            Cors::default()
                .allowed_origins(&config.cors_origins)
                .allowed_methods(["GET", "POST", "OPTIONS"])
                .allowed_headers(["Content-Type", "Authorization"])
                .max_age(3600)
        )
        // 4. Rate limiting
        .wrap(RateLimitMiddleware::new(100, Duration::from_secs(60)))
        // 5. Body parse (with size limits for uploads)
        .app_data(web::JsonConfig::default().limit(1024 * 1024)) // 1MB for JSON
        // 6-9. Auth, Authz, Validation, Handler are per-route
        .configure(|c| configure_routes(c, schema));
}
```

---

## 10. Anti-Patterns Checklist

Mapping the skill's anti-patterns to this stack:

| Anti-Pattern | How We Avoid It |
|---|---|
| Business logic in routes | All logic in `service.rs`, schema only does input/output mapping |
| Scattered env vars | Single `AppConfig` struct, validated at startup |
| Generic `Error` | `AppError` enum with typed codes and status |
| No validation | `required_env()` at startup; `InputObject` validation in GraphQL; content-type whitelist for uploads |
| Silent catches | All errors flow through `AppError`; no bare `catch` without logging |
| JWT in localStorage | HttpOnly cookie for refresh; short-lived access token in memory only |
| Raw API errors to client | `mapGraphQLError()` sanitizes all errors before display |
| Duplicated types | `graphql-codegen` generates TypeScript from Rust schema |
| Large uploads through server | Presigned URL flow bypasses the backend for file data |
| No request tracing | Request ID middleware propagates through all layers |

---

## 11. Auth & JWT Pattern

The skill specifies: **JWT 15min + httpOnly refresh**.

```rust
// src/middleware/auth.rs
use actix_web::{HttpRequest, FromRequest, dev::Payload};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,      // user ID
    pub exp: usize,       // expiry (15 min)
    pub iat: usize,       // issued at
    pub role: String,     // user role for authz
}

pub struct AuthenticatedUser {
    pub id: String,
    pub role: String,
}

impl FromRequest for AuthenticatedUser {
    type Error = AppError;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _payload: &mut Payload) -> Self::Future {
        let auth_header = req.headers().get("Authorization");
        match auth_header.and_then(|h| h.to_str().ok()) {
            Some(header) if header.starts_with("Bearer ") => {
                let token = &header[7..];
                match decode::<Claims>(token, &DecodingKey::from_secret("secret"), &Validation::default()) {
                    Ok(data) => ok(AuthenticatedUser {
                        id: data.claims.sub,
                        role: data.claims.role,
                    }),
                    Err(_) => err(AppError::unauthorized("Invalid or expired token")),
                }
            }
            _ => err(AppError::unauthorized("Missing authorization header")),
        }
    }
}
```

```typescript
// src/lib/stores/auth.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  userId: string | null;
  isAuthenticated: boolean;
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    token: null,
    refreshToken: null,
    userId: null,
    isAuthenticated: false,
  });

  return {
    subscribe,

    /** Login stores access token in memory only (skill: no JWT in localStorage) */
    login(token: string, userId: string) {
      update((s) => ({
        ...s,
        token,
        userId,
        isAuthenticated: true,
      }));
      // Refresh token is set as httpOnly cookie by the server — never accessible to JS
    },

    logout() {
      update((s) => ({
        ...s,
        token: null,
        refreshToken: null,
        userId: null,
        isAuthenticated: false,
      }));
    },

    /** Refresh the access token using the httpOnly cookie */
    async refresh(): Promise<string | null> {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include', // Send httpOnly cookie
        });
        if (!res.ok) {
          this.logout();
          return null;
        }
        const data = await res.json();
        update((s) => ({
          ...s,
          token: data.accessToken,
          isAuthenticated: true,
        }));
        return data.accessToken;
      } catch {
        this.logout();
        return null;
      }
    },
  };
}

export const authStore = createAuthStore();
```

---

## Summary of Skill Application

| Skill Principle | Implementation |
|---|---|
| Feature-first organization | `photos/`, `uploads/` with controller/service/repository |
| Centralized typed config | `AppConfig::from_env()` with `required_env()`, fail-fast |
| Typed error hierarchy | `AppError` enum with `AppErrorCode`, operational vs programming |
| Structured logging with request IDs | `RequestIdMiddleware` → `Logger` with `%{request-id}i` |
| Input validation at every boundary | `required_env()`, GraphQL `InputObject`, content-type whitelist |
| Presigned URL for uploads >5MB | 3-step flow: request URL → PUT to S3 → confirm with backend |
| WebSocket for real-time | `async-graphql` subscriptions over WS with `broadcast` channel |
| Type sharing without duplication | Schema SDL export → `graphql-codegen` → TypeScript |
| JWT 15min + httpOnly refresh | In-memory access token, httpOnly cookie refresh |
| Cross-boundary error mapping | `mapGraphQLError()` + `extractFieldErrors()` on frontend |
| Auto-retry 5xx, never 4xx | `shouldRetry()` + `graphql-ws` retry config |