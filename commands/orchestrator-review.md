---
description: Fan out all review gates in parallel and merge one report
---
Load and execute the orchestrator-review skill (mention: @orchestrator-review) now. Fan out the review lanes (code-review, security-auditor, ui-auditor, goal-verify, conditional regression-gate, oracle second opinion), barrier until every lane reaches a terminal state, and deliver the merged report.
