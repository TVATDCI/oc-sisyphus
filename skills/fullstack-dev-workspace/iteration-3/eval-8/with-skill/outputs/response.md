This task is outside the scope of fullstack-dev. It is a **build failure diagnosis** task.

The `build-resolver` skill is designed for this — it provides structured triage for broken builds (dependency issues, code drift, config drift, external factors). Switch to that skill for proper handling.

To invoke it, you can say: `use build-resolver` or describe your build failure and ask for build-resolver specifically. It will walk you through diagnosing the module resolution error and missing dependency in your API route systematically.
