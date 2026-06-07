---
description: >
  Fullstack developer subagent — builds full-stack apps, REST APIs, service
  layers, integrates frontend with backend, handles auth/config/real-time.
  TRIGGER when: building a full-stack app, creating REST API with frontend,
  designing service layers, implementing error handling, managing config/auth,
  setting up API clients, implementing auth flows (JWT/session/OAuth),
  connecting frontend to backend, adding real-time features (SSE/WebSocket),
  hardening for production, designing project structure,
  or implementing data layer patterns.
  DO NOT TRIGGER when: fixing a build failure, reviewing existing code,
  or scanning for security vulnerabilities.
mode: subagent
temperature: 0.1
load_skills:
  - fullstack-dev
permission:
  read:
    "*": allow
  edit:
    "*": allow
  bash:
    "*": ask
    "npm run *": allow
    "npm install *": allow
    "npx *": allow
    "tsc *": allow
    "node *": allow
    "ls *": allow
    "mkdir *": allow
    "cat *": allow
    "grep *": allow
---
