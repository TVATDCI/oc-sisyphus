---
type: research
title: Good AI List Re-scan — Evaluation, Monitoring, Guardrails, Orchestration
date: 2026-05-29
---

# Good AI List Re-scan: Tools for Sisyphus Ecosystem

Second-pass analysis focused on four categories relevant to our agent system: evaluation, monitoring, guardrails, and orchestration.

## Category 1: Evaluation Frameworks

### Commercial (SaaS)

| Tool | Key Feature | Assessment |
|------|-------------|------------|
| **Braintrust** | Evaluation-first architecture; traces → test cases with one click; CI/CD integration | Overkill for local agent. Designed for product teams shipping to millions of users. |
| **Galileo** | Luna-2 purpose-built eval models (sub-200ms); runtime protection; root cause analysis | Enterprise platform. SOC 2, Fortune 50 deployments. Massive overkill for our use case. |
| **Vellum** | Visual workflow builder with observability | Low-code focus. Doesn't fit our CLI-centric, skill-driven architecture. |

### Open-Source

| Tool | Key Feature | Assessment |
|------|-------------|------------|
| **Langfuse** | Open-source LLM engineering platform; trace/span tracking; cost attribution; prompt versioning | **Most promising.** Self-hostable, lightweight, integrates via OpenTelemetry. Could trace our skill executions. |
| **Arize Phoenix** | Open-source, OpenTelemetry-native; RAG/agent evaluators; drift detection | Strong alternative to Langfuse. Same OpenTelemetry foundation. Slightly heavier setup. |
| **DeepEval (Confident AI)** | 40+ LLM-as-a-Judge metrics; red teaming; component-level evaluation | Good for benchmarking, but most metrics require external LLM-as-judge (adds cost/latency). |

### Verdict: Evaluation

**Do not adopt commercial SaaS** (Braintrust, Galileo, Vellum). They solve problems at scale we don't have.

**Consider Langfuse or Phoenix** if we want structured tracing and cost attribution. Both are:
- Open-source and self-hostable
- OpenTelemetry-native (vendor-neutral)
- Support nested traces/spans (perfect for skill → subagent → tool call chains)
- Granular cost tracking per trace/session

**Our benchmark gap:** We measure tool calls and tokens (efficiency), but not quality (correctness, tool selection accuracy, task completion). We should enhance the benchmark scorer.

## Category 2: Monitoring & Observability

### Commercial

| Tool | Key Feature | Assessment |
|------|-------------|------------|
| **Helicone** | Proxy-based observability; multi-provider cost routing; caching | Quick setup, but proxy architecture is invasive. Not a fit. |
| **Fiddler** | Enterprise governance; compliance monitoring; VPC/air-gapped | Regulated industries only. Overkill. |

### Open-Source / Lightweight

| Tool | Key Feature | Assessment |
|------|-------------|------------|
| **Langtrace** | Open-source observability for CrewAI/LangChain/LlamaIndex | Framework-specific. We're not using those frameworks. |
| **OpenTelemetry (native)** | Industry standard; vendor-neutral; our system already produces structured logs | **Best fit.** We can emit OTEL spans from our skill execution and aggregate locally. |

### Verdict: Monitoring

**Skip commercial tools.** Our system already has:
- JSONL session preservation (full history)
- Evidence files per task (`.sisyphus/evidence/`)
- Model transparency reporting (executed via track-execution.sh)
- Git commit history (immutable record)

**Gap:** We lack structured tracing of decision chains. A lightweight OTEL exporter would close this without adding dependencies.

## Category 3: Test & Guardrails

### Runtime Guardrails

| Tool | Key Feature | Assessment |
|------|-------------|------------|
| **Guardrails AI** | Runtime guardrails; policy violation detection; hallucination blocking | Heavy framework. Requires defining guardrail specs. Overkill for local use. |
| **Galileo Protect** | Real-time prompt/response scanning; sub-200ms latency | SaaS-only. Requires API key. Not a fit. |

### Test Generation

| Tool | Key Feature | Assessment |
|------|-------------|------------|
| **Trajectory Evals** | Sandbox evaluations; synthetic training data; closed-loop pipeline | Focused on training data generation, not runtime testing. |

### Verdict: Guardrails

**Do not adopt external guardrail frameworks.** Our `security-auditor` skill already provides pre-deployment scanning. What we need:
1. **Runtime checks in wave-executor** — before destructive operations (rm, git push, deploy)
2. **Approval gates for irreversible actions** — already partially implemented via checkpoints
3. **Post-execution verification** — already implemented via goal-backward verification

**Enhancement opportunity:** Add a lightweight "dangerous operation" regex check in wave-executor before executing shell commands, similar to Hermes's `ToolCallGuardrailController`.

## Category 4: Orchestration Frameworks

| Framework | Key Feature | Assessment |
|-----------|-------------|------------|
| **LangGraph** | Stateful graph-based orchestration; cyclic workflows | We're skill-based, not graph-based. Different paradigm. |
| **CrewAI** | Multi-agent coordination; role-based agents | Our subagent system (`task()` with categories) is already a form of multi-agent orchestration. CrewAI would add abstraction without value. |
| **AutoGen / Microsoft Agent Framework** | Conversational agents; code generation | Not aligned with our execution-focused workflow. |
| **Mastra** | TypeScript-native; memory; tool use | Newer framework. Might have useful patterns but not worth migrating. |

### Verdict: Orchestration

**No migration needed.** Our skill system + subagent delegation (`task()` with categories) is sufficient. What we can learn:
- LangGraph's state persistence between steps → our state.json already does this
- CrewAI's role-based delegation → our category-based subagent selection is similar
- **Pattern to adopt:** Explicit state machines for long-running workflows (we have this via plan/wave/slice)

## Synthesis: What to Actually Do

### High-Value, Low-Effort

1. **Enhance benchmark scorer** — Add quality metrics beyond pass/fail:
   - Tool selection accuracy (did it use the right tool for the job?)
   - Evidence completeness (did it produce all required evidence files?)
   - Scope adherence (did it stay within the task scope?)
   - Regression detection (did it break existing functionality?)

2. **Add lightweight tracing** — Emit OpenTelemetry spans from skill execution:
   - One span per skill invocation
   - Sub-spans for subagent calls, tool executions
   - Attributes: model, category, token count, duration, outcome
   - Export to local JSON or Jaeger (optional)

3. **Runtime dangerous-op check** — In wave-executor, before executing shell commands:
   - Regex match for `rm -rf`, `git push`, `deploy`, `DROP TABLE`, etc.
   - Require explicit approval for matches
   - Log approval in evidence file

### Medium-Value, Medium-Effort

4. **Automated regression detection** — Our regression-gate skill runs tests. Enhance it:
   - Compare current wave's output against prior wave's golden outputs
   - Flag semantic differences (not just test failures)
   - Use LLM-as-judge for fuzzy comparison when exact match isn't possible

5. **Cost attribution dashboard** — Aggregate `track-execution.sh` logs into a per-plan/per-wave cost report

### Not Recommended (Overkill)

- Braintrust, Galileo, Vellum, Fiddler (commercial SaaS platforms)
- Guardrails AI (heavy framework for local use)
- LangGraph, CrewAI, AutoGen (framework migration)
- Helicone (proxy architecture too invasive)

## Sources

- Braintrust: https://www.braintrust.dev/articles/best-ai-agent-observability-tools-2026
- Galileo: https://galileo.ai/blog/best-agent-evaluation-frameworks
- Guardrails AI: https://guardrailsai.com/
- Langfuse: https://langfuse.com/
- Arize Phoenix: https://phoenix.arize.com/
- Good AI List: https://goodailist.com/
