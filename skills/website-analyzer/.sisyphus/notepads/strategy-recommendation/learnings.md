# Learnings Log

## 2026-05-31: Scored heuristic > LLM for classification

**Learning:** When you have a fixed set of categories and well-defined signals, a weighted matrix beats LLM-based classification on: cost (free), latency (μs vs seconds), determinism (same input → same output), and auditability (you can point at exactly why a category won).

**Context:** Oracle consultation confirmed this. Heuristic weights are fine for v1.0 — calibrate from production data.
