# Problems Log

## 2026-05-31: Heavy storage usage for output

**Problem:** website-analyzer produces DESIGN.md (21+ sections), content-inventory.json, tech-detections.json, analysis-summary.md per run. Adding strategy-signals.json and strategy-weights.json increases artifact count further.

**Resolution:** Not an issue — these files are small JSON blobs (<5 KB each). Acceptable for the feature.

**Closed:** 2026-05-31
