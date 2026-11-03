#!/usr/bin/env python3
"""regenerate_hotcache.py — deterministic hotcache regeneration from authority.

Slice two of the sis-memory implementation (captain word 2026-11-03: "begin
with slices two and three"). The hotcache (~/.sisyphus/hotcache.md) is a
DERIVED, EXPIRING, REBUILDABLE ACCELERATOR — never a truth root
(skills/memory-doctrine SKILL.md §1). Losing it is a warm-start loss, never
data loss: rebuild, don't mourn (§3 hotcache honesty).

DETERMINISM LAW (this script's whole point): the hotcache must always be
derivable from the authoritative sources (workflow state + bd memories + git
head) by a deterministic procedure — SAME INPUTS, SAME OUTPUT. There is no
wall-clock timestamp, no randomness, and no order instability anywhere in the
product bytes. Provenance/staleness is carried as CONTENT FINGERPRINTS of the
boss inputs (sha256, truncated) plus input-derived values only — so:

  * rebuilding after deletion (or corruption) reproduces byte-identical bytes,
  * staleness is machine-checkable: re-fingerprint the bosses (`--check`) and
    compare against the markers recorded in the cache — drift means rebuild.

Excluded from the projection by design: `last_updated` and every other
non-allowlisted state.json field (the plugin rewrites it on unrelated
activity — it is not workflow truth and would break determinism), and bd's
human rendering (truncates long values; the `--json` full-fidelity output is
the parse source instead).

Boss inputs (skills/memory-doctrine §1 authority map):
  1. workflow state  — state.json Layer-0 trust-root, projected through a
     FIXED ALLOWLIST (schema_version, project, phase, prd_gate, plan_gate,
     approval_status). The projection script is the sanctioned mechanism that
     turns the trust-root into its agent-readable form.
  2. bd memories     — read via `bd memories --json` (full fidelity, no
     truncation), store pinned by BEADS_DIR so cwd can never change what is
     read (same pin discipline as bd_remember.py / session-begin Step 2).
     Read-only: this script NEVER writes bd.
  3. git head        — one bounded fixed-ref query (`log -1`), deterministic
     per repository state; `--no-git` omits the input entirely.

Contradictions (doctrine §3): two pipe-format records sharing the write-law
identity {scope}:{category}:{key} but carrying different values cannot both
be current — update-in-place (--key) is the sole door's behavior, so
coexistence means store drift or a hand-run write. The regenerator SURFACES
every such conflict in a dedicated cache section (both sides verbatim,
resolution required) and never silently resolves by newest-wins, order, or
any other tiebreak. Detection is code; resolution stays judgment.

Bounded hydration (doctrine §3; T5): `--print-injection --budget N` renders
the budget-selected injection set — hard constraints first, then
dependency/exact values, then the remaining categories in canonical key
order, filling whole entries until the budget is exhausted. NOTE: recency is
NOT derivable from today's store (bd memory records carry no dates) — tier 3
is canonical key order, a deterministic stand-in documented here; the NUMERIC
budget value for session-begin lands with slice three, which is also the
slice that wires this mechanism into the session-begin ritual (the Step-2
fixed mechanism stays operative until then — no silent bending either way).

Usage:
    python3 scripts/regenerate_hotcache.py                        # rebuild ~/.sisyphus/hotcache.md
    python3 scripts/regenerate_hotcache.py --stdout               # cache bytes to stdout, no write
    python3 scripts/regenerate_hotcache.py --check                # staleness check (exit 1 = stale)
    python3 scripts/regenerate_hotcache.py --print-injection --budget 20000
    python3 scripts/regenerate_hotcache.py --state S --beads-dir B --git-repo G --out O
    python3 scripts/regenerate_hotcache.py --no-git               # omit the git input
    python3 scripts/regenerate_hotcache.py --from-capture FILE    # parse a captured bd memories --json

Fixture/test discipline: `--state`, `--beads-dir`, `--git-repo`, `--out`,
`--from-capture` pin every input path, so tests exercise the full procedure
against scratch fixtures only — never the live store, never a tracked repo
as the bd working directory.

Output contract (deterministic):
    stderr: HOTCACHE-REGENERATED: <out> (<n> bytes) bd=<fp> state=<fp> git=<fp>
            CONTRADICTION <identity>: <n> differing values surfaced   (per conflict)
            HOTCACHE-STALE: <input> fingerprint drifted (<a> -> <b>)  (--check)
            HOTCACHE-CURRENT: fingerprints match boss surfaces        (--check)
            HOTCACHE-CHECK-NA: no regeneration marker (model-written handoff) (--check)
    stdout: cache bytes (--stdout) | budget-selected injection entries + BOUND line
            (--print-injection) | nothing otherwise

Exit codes:
    0  cache written / injection printed / --check current (or NA)
    1  --check stale (fingerprint drift — rebuild)
    2  input or mechanical failure (bd missing, store unreadable, state
       unparseable) — fail-closed: never write a cache from partial bosses
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys

# state.json projection allowlist — fixed, not a denylist. `last_updated` is
# deliberately excluded: the plugin rewrites it on unrelated activity, so it
# is not workflow truth and would break same-inputs-same-output.
STATE_ALLOWLIST = (
    "schema_version",
    "project",
    "phase",
    "prd_gate",
    "plan_gate",
    "approval_status",
)

# Doctrine §3 hydration ordering law: hard constraints first, then
# active-task dependencies and exact values, then everything else. Recency is
# not derivable from today's records (no dates) — canonical key order stands
# in for tier 3, documented in the module docstring.
CATEGORY_TIER = {
    "constraint": 0,
    "dependency": 1,
    "exact": 1,
}

CATEGORY_SECTION = {
    "constraint": "Preserved Constraints",
    "dependency": "Active Dependencies",
    "exact": "Critical Values",
    "decision": "Decisions Made",
    "next": "Next Steps",
    "files": "Files Modified",
}

# Fixed byte-for-byte placeholder strings (two contexts must render
# identical output for identical inputs — including for "nothing here").
NO_INTENT = "(no intent-category records in the store)"
NO_STATE = "(workflow state unavailable — missing or unparseable)"
NO_GIT = "(git input absent — unavailable or not a repository)"
NO_EVIDENCE = (
    "(regenerated projection carries no session evidence pointers — "
    "evidence is session-local and lives in ~/.sisyphus/evidence/)"
)

RECORD_RE = re.compile(r"^([a-z_]+):(.+?) [—-] (.*)$", re.DOTALL)
GENERATED_MARKER_RE = re.compile(
    r"^\*\*Regenerated from:\*\* bd=([0-9a-f]{12}) state=([0-9a-f]{12}) git=([0-9a-f]{12}|none)\s*$",
    re.MULTILINE,
)


# git vars git itself injects into hook environments (GIT_DIR et al). When
# this script runs as a child of a git hook (the repo's pre-push hook runs
# the suite that exercises it), GIT_DIR would override `git -C <repo>`
# discovery and silently read the WRONG repository — the 2026-11-03
# incident class. Stripping restores cwd-based discovery per the --git-repo
# contract. (bd gets the same strip for hygiene.)
GIT_HOOK_ENV_VARS = (
    "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY", "GIT_COMMON_DIR",
)


def sanitized_git_env(extra=None):
    env = {**os.environ}
    for var in GIT_HOOK_ENV_VARS:
        env.pop(var, None)
    if extra:
        env.update(extra)
    return env


# ── Fingerprints ─────────────────────────────────────────────────────────────


def fingerprint(canonical: str) -> str:
    """sha256 of a canonical string, truncated to 12 hex chars."""
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12]


def canonical_json(obj) -> str:
    """Byte-stable serialization: sorted keys, fixed separators, no spaces."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


# ── Input loading ────────────────────────────────────────────────────────────


class InputError(Exception):
    """Mechanical input failure — exit 2, fail-closed, no cache written."""


def default_beads_dir() -> str:
    return os.environ.get("BEADS_DIR") or os.path.expanduser("~/Main-vault/.beads")


def load_memories(beads_dir: str) -> dict:
    """Read the bd memory store via `bd memories --json` (full fidelity).

    BEADS_DIR pins the store so cwd can never change what is read. The plain
    JSON rendering is the parse source because the human rendering truncates
    long values. The result is a raw {bd_id: record_string} map (metadata
    keys like schema_version are skipped at parse time).
    """
    env = sanitized_git_env({"BEADS_DIR": beads_dir})
    try:
        result = subprocess.run(
            ["bd", "memories", "--json"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            env=env,
        )
    except FileNotFoundError as err:
        raise InputError(f"bd not found on PATH ({err})") from err
    if result.returncode != 0:
        raise InputError(
            f"bd memories --json failed (exit {result.returncode}): "
            f"{result.stderr.strip()[:200]}"
        )
    return parse_memories_json(result.stdout, source=beads_dir)


def parse_memories_json(raw: str, source: str) -> dict:
    """Parse a `bd memories --json` payload into {bd_id: record_string}.

    Non-string values are store metadata (e.g. schema_version), never
    records — skipping them keeps the record set exactly the boss content.
    """
    try:
        payload = json.loads(raw)
    except ValueError as err:
        raise InputError(f"bd memories output unparseable ({source}): {err}") from err
    if not isinstance(payload, dict):
        raise InputError(f"bd memories output is not a JSON object ({source})")
    return {k: v for k, v in payload.items() if isinstance(v, str)}


def load_state(state_path: str):
    """Read state.json and return (projection_dict_or_None, fingerprint).

    Missing or unparseable workflow state is NOT a mechanical failure: the
    cache still rebuilds from the other bosses and the phase line renders the
    fixed placeholder. The projection carries the allowlisted keys only.
    """
    if not os.path.exists(state_path):
        return None, fingerprint("state:absent")
    try:
        with open(state_path, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
    except (OSError, ValueError):
        return None, fingerprint("state:absent")
    if not isinstance(payload, dict):
        return None, fingerprint("state:absent")
    projection = {k: payload[k] for k in STATE_ALLOWLIST if k in payload}
    return projection, fingerprint(canonical_json(projection))


def load_git_head(git_repo: str):
    """One bounded fixed-ref query: HEAD hash + committer date + subject.

    Deterministic per repository state (a fixed ref at a fixed commit). Any
    failure resolves to the fixed absent marker — never the raw error text,
    which would leak unstable strings into the product.
    """
    try:
        result = subprocess.run(
            ["git", "-C", git_repo, "log", "-1",
             "--pretty=%H%x00%cI%x00%s"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            env=sanitized_git_env(),
        )
    except FileNotFoundError:
        return None
    if result.returncode != 0:
        return None
    parts = result.stdout.strip().split("\x00")
    if len(parts) != 3 or not all(parts):
        return None
    return {"hash": parts[0], "date": parts[1], "subject": parts[2]}


# ── Records ──────────────────────────────────────────────────────────────────


class Record:
    """One durable memory record, normalized for deterministic assembly.

    Pipe-format records (the wrapper's canonical shape) parse into fields and
    carry identity {scope}:{category}:{key}; legacy records (pi-side slugs)
    route by their leading `category:key — value` prefix and carry the bd id
    as identity, mirroring session-begin's dedupe rule. Everything else is
    unrouted verbatim — never dropped, never guessed into a category.
    """

    __slots__ = ("bd_id", "raw", "identity", "category", "key", "value", "routed")

    def __init__(self, bd_id, raw):
        self.bd_id = bd_id
        self.raw = raw
        self.identity = bd_id
        self.category = None
        self.key = None
        self.value = raw
        self.routed = False
        self._parse()

    def _parse(self):
        fields = parse_pipe_record(self.raw)
        if fields is not None:
            scope, turn, category, key, value = fields
            self.identity = f"{scope}:{category}:{key}"
            self.category = category if category in CATEGORY_SECTION or category == "intent" else None
            self.key = key
            self.value = value
            self.routed = self.category is not None
            return
        m = RECORD_RE.match(self.raw)
        if m and (m.group(1) in CATEGORY_SECTION or m.group(1) == "intent"):
            self.category = m.group(1)
            self.key = m.group(2)
            self.value = m.group(3)
            self.routed = True

    @property
    def sort_key(self):
        return (CATEGORY_TIER.get(self.category, 3) if self.routed else 3,
                self.identity.encode("utf-8"))

    @property
    def render(self):
        return f"- {self.identity} — {self.value}"


def parse_pipe_record(raw):
    """Parse `scope=…|turn=…|category=…|key=…|value=…` respecting \\| escapes.

    Returns (scope, turn, category, key, value) or None when the record does
    not carry all five well-formed fields (legacy or foreign shape).
    """
    parts = []
    buf = []
    escaped = False
    for ch in raw:
        if escaped:
            buf.append(ch)
            escaped = False
        elif ch == "\\":
            escaped = True
        elif ch == "|":
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    parts.append("".join(buf))
    if len(parts) != 5:
        return None
    fields = {}
    for part in parts:
        if "=" not in part:
            return None
        k, _, v = part.partition("=")
        fields[k.strip()] = v
    for required in ("scope", "turn", "category", "key", "value"):
        if required not in fields:
            return None
    return (
        fields["scope"], fields["turn"], fields["category"],
        fields["key"], fields["value"],
    )


def build_records(memory_map: dict):
    """Records in canonical total order (tier, then identity bytes).

    Same-identity records carrying the SAME value are duplication noise —
    deduplicated to the first occurrence in canonical order, mirroring
    session-begin's assembly rule (one identity renders once). Identities
    carrying DIFFERENT values are contradictions: every side is kept and
    surfaced by detect_contradictions, never collapsed.
    """
    ordered = sorted((Record(bd_id, raw) for bd_id, raw in memory_map.items()),
                     key=lambda r: r.sort_key)
    records = []
    seen_values = {}
    for rec in ordered:
        if rec.routed:
            first = seen_values.get(rec.identity)
            if first is not None:
                if first.value == rec.value:
                    continue  # same-value duplicate — dedupe to first
                records.append(rec)  # differing value — contradiction side
                continue
            seen_values[rec.identity] = rec
            records.append(rec)
        else:
            records.append(rec)
    return records


def detect_contradictions(records):
    """Pipe-format records sharing one identity with differing values.

    The write law makes {scope}:{category}:{key} unique (update-in-place via
    --key); coexistence with differing values is store drift or a hand-run
    write. Returns {identity: [Record, ...]} — every side listed, none
    dropped, no tiebreak applied (doctrine §3: contradictions surface).
    """
    by_identity = {}
    for rec in records:
        if rec.routed:
            by_identity.setdefault(rec.identity, []).append(rec)
    contradictions = {}
    for identity, group in by_identity.items():
        if len(group) > 1:
            values = {rec.value for rec in group}
            if len(values) > 1:
                contradictions[identity] = sorted(
                    group, key=lambda r: r.bd_id.encode("utf-8")
                )
    return dict(sorted(contradictions.items()))


# ── Bounded hydration (doctrine §3; the slice-3 wiring point) ───────────────


def select_within_budget(records, budget_chars: int):
    """Greedy whole-entry fill in doctrine priority order under a char bound.

    Entries are considered in the canonical total order (constraints, then
    dependency/exact, then the rest by key); an entry is included whole or
    skipped entirely — never truncated mid-record. Returns (selected,
    omitted_next_record_or_None). budget_chars is a rendered-CHARACTER bound
    (the deterministic proxy for the token budget; the numeric session-begin
    value lands with slice three).
    """
    selected = []
    used = 0
    omitted_next = None
    for rec in records:
        cost = len(rec.render) + 1  # +1 newline
        if used + cost <= budget_chars:
            selected.append(rec)
            used += cost
        else:
            omitted_next = rec
            break
    return selected, omitted_next


# ── Assembly ─────────────────────────────────────────────────────────────────


def render_section(title, records, conflicted):
    lines = [f"## {title}"]
    routed = [
        r for r in records
        if r.routed and CATEGORY_SECTION.get(r.category) == title
        and r.identity not in conflicted
    ]
    if routed:
        lines.extend(rec.render for rec in routed)
    else:
        category = next(k for k, v in CATEGORY_SECTION.items() if v == title)
        lines.append(f"- (no {category}-category records in the store)")
    return "\n".join(lines)


def project_state_line(projection):
    if projection is None:
        return NO_STATE
    parts = [
        f"{k}={projection[k]}" for k in STATE_ALLOWLIST if k in projection
    ]
    return " ".join(parts) if parts else NO_STATE


def assemble(memory_map, state_projection, state_fp, git_head, beads_source):
    """The deterministic product: cache bytes from boss inputs. Pure."""
    records = build_records(memory_map)
    contradictions = detect_contradictions(records)
    bd_fp = fingerprint(canonical_json(sorted(memory_map.items())))
    git_fp = (
        fingerprint(canonical_json(git_head)) if git_head else "none"
    )

    intent_records = [r for r in records if r.routed and r.category == "intent"]
    intent_line = intent_records[0].value if intent_records else NO_INTENT

    lines = []
    lines.append("# Session Handoff")
    lines.append("")
    lines.append(
        f"**Regenerated from:** bd={bd_fp} state={state_fp} git={git_fp}"
    )
    lines.append(f"**Original intent:** {intent_line}")
    lines.append(f"**Current phase:** {project_state_line(state_projection)}")
    lines.append("")
    for title in (
        "Files Modified",
        "Decisions Made",
        "Next Steps",
        "Evidence References",
        "Preserved Constraints",
        "Active Dependencies",
        "Critical Values",
    ):
        if title == "Evidence References":
            lines.append("## Evidence References")
            lines.append(f"- {NO_EVIDENCE}")
        else:
            # conflicted identities render ONLY in the Contradictions
            # section — their category section must never read like a
            # resolved value (doctrine §3: never silently resolved)
            lines.append(render_section(title, records, set(contradictions)))
        lines.append("")

    unrouted = [r for r in records if not r.routed]
    lines.append("## Additional Durable Records")
    if unrouted:
        lines.extend(rec.render for rec in unrouted)
    else:
        lines.append("- (no unrouted records in the store)")
    lines.append("")

    lines.append("## Memory Provenance")
    lines.append(
        f"- bd memories: {beads_source} — {len(memory_map)} records — fingerprint {bd_fp}"
    )
    lines.append(
        f"- workflow state projection: {project_state_line(state_projection)} — fingerprint {state_fp}"
    )
    if git_head:
        lines.append(
            f"- git head: {git_head['hash'][:12]} {git_head['date']} {git_head['subject']}"
        )
    else:
        lines.append(f"- git head: {NO_GIT}")
    lines.append(
        "- generator: scripts/regenerate_hotcache.py — derived accelerator, never a "
        "truth root (skills/memory-doctrine §1/§3): identical inputs reproduce these "
        "bytes exactly; staleness is fingerprint drift, checkable with --check."
    )
    lines.append("")

    if contradictions:
        lines.append("## Contradictions (resolution required)")
        lines.append(
            "- surfaced per skills/memory-doctrine §3 — never silently resolved by "
            "newest-wins, order, hotcache, or web content:"
        )
        for identity, group in contradictions.items():
            lines.append(f"- {identity} carries {len(group)} differing values:")
            for rec in group:
                lines.append(f"    - {rec.bd_id}: {rec.value}")
            lines.append(
                "    RESOLUTION REQUIRED: reconcile at the boss surface (bd update/forget "
                "under one key) before treating either value as current."
            )
        lines.append("")

    return "\n".join(lines).rstrip("\n") + "\n", bd_fp, git_fp


# ── Modes ────────────────────────────────────────────────────────────────────


def load_inputs(args):
    if args.from_capture:
        try:
            with open(args.from_capture, "r", encoding="utf-8") as fh:
                memory_map = parse_memories_json(fh.read(), source=args.from_capture)
        except OSError as err:
            raise InputError(f"capture unreadable: {err}") from err
    else:
        memory_map = load_memories(args.beads_dir)
    state_projection, state_fp = load_state(args.state)
    git_head = None if args.no_git else load_git_head(args.git_repo)
    return memory_map, state_projection, state_fp, git_head


def mode_rebuild(args) -> int:
    try:
        memory_map, state_projection, state_fp, git_head = load_inputs(args)
    except InputError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        return 2

    beads_source = args.from_capture or args.beads_dir
    cache_text, bd_fp, git_fp = assemble(
        memory_map, state_projection, state_fp, git_head, beads_source
    )

    if args.stdout:
        sys.stdout.write(cache_text)
    else:
        try:
            tmp = args.out + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                fh.write(cache_text)
            os.replace(tmp, args.out)
        except OSError as err:
            print(f"ERROR: cache write failed: {err}", file=sys.stderr)
            return 2

    print(
        f"HOTCACHE-REGENERATED: {args.out} ({len(cache_text.encode('utf-8'))} bytes) "
        f"bd={bd_fp} state={state_fp} git={git_fp}",
        file=sys.stderr,
    )
    for identity, group in detect_contradictions(build_records(memory_map)).items():
        values = {rec.value for rec in group}
        print(
            f"CONTRADICTION {identity}: {len(values)} differing values surfaced",
            file=sys.stderr,
        )
    return 0


def mode_check(args) -> int:
    try:
        with open(args.out, "r", encoding="utf-8") as fh:
            existing = fh.read()
    except OSError as err:
        print(f"HOTCACHE-STALE: cache unreadable ({err}) — rebuild", file=sys.stderr)
        return 1
    m = GENERATED_MARKER_RE.search(existing)
    if not m:
        print(
            "HOTCACHE-CHECK-NA: no regeneration provenance marker — model-written "
            "handoff (staleness owned by its own timestamps)",
            file=sys.stderr,
        )
        return 0
    cached_bd, cached_state, cached_git = m.groups()
    try:
        memory_map, state_projection, state_fp, git_head = load_inputs(args)
    except InputError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        return 2
    bd_fp = fingerprint(canonical_json(sorted(memory_map.items())))
    git_fp = fingerprint(canonical_json(git_head)) if git_head else "none"

    stale = []
    if cached_bd != bd_fp:
        stale.append(f"bd memory fingerprint drifted ({cached_bd} -> {bd_fp})")
    if cached_state != state_fp:
        stale.append(f"workflow state fingerprint drifted ({cached_state} -> {state_fp})")
    if cached_git != git_fp:
        stale.append(f"git fingerprint drifted ({cached_git} -> {git_fp})")

    if stale:
        for line in stale:
            print(f"HOTCACHE-STALE: {line}", file=sys.stderr)
        print(
            "CONSUMPTION: rebuild with scripts/regenerate_hotcache.py — the cache is "
            "a derived accelerator; drift is expected, never data loss "
            "(skills/memory-doctrine §1/§3).",
            file=sys.stderr,
        )
        return 1
    print(
        "HOTCACHE-CURRENT: cache fingerprints match boss surfaces (bd/state/git)",
        file=sys.stderr,
    )
    return 0


def mode_injection(args) -> int:
    try:
        memory_map, _state, _fp, _git = load_inputs(args)
    except InputError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        return 2
    selected, omitted_next = select_within_budget(build_records(memory_map), args.budget)
    for rec in selected:
        print(rec.render)
    print(
        f"BOUND: budget={args.budget} selected={len(selected)} "
        f"omitted_next={omitted_next.identity if omitted_next else 'none'}"
    )
    print(
        "CONSUMPTION: mechanism only — the numeric session-begin budget lands with "
        "slice three; ordering law per skills/memory-doctrine §3.",
        file=sys.stderr,
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Deterministic hotcache regeneration from authority (workflow state + "
            "bd memories + git head). Same inputs, same output — staleness as "
            "content fingerprints, contradictions surfaced, never resolved."
        ),
    )
    parser.add_argument(
        "--out", default=os.path.expanduser("~/.sisyphus/hotcache.md"),
        help="cache target path (default: ~/.sisyphus/hotcache.md)",
    )
    parser.add_argument(
        "--state", default=os.path.expanduser("~/.sisyphus/state.json"),
        help="workflow state input (default: ~/.sisyphus/state.json)",
    )
    parser.add_argument(
        "--beads-dir", default=default_beads_dir(),
        help="bd store input (default: $BEADS_DIR or ~/Main-vault/.beads)",
    )
    parser.add_argument(
        "--git-repo", default=os.path.expanduser("~/.config/opencode"),
        help="git head input repo (default: ~/.config/opencode)",
    )
    parser.add_argument(
        "--no-git", action="store_true",
        help="omit the git head input (section + fingerprint render their absent form)",
    )
    parser.add_argument(
        "--from-capture", default=None,
        help="parse a captured `bd memories --json` file instead of invoking bd "
             "(degraded recovery when bd is down; also the fixture/test seam)",
    )
    parser.add_argument(
        "--check", action="store_true",
        help="staleness check only: compare the cache's Regenerated-from "
             "fingerprints against the current boss surfaces (exit 1 = stale)",
    )
    parser.add_argument(
        "--stdout", action="store_true",
        help="write cache bytes to stdout instead of the file",
    )
    parser.add_argument(
        "--print-injection", action="store_true",
        help="print the budget-selected injection set (bounded hydration "
             "mechanism; requires --budget)",
    )
    parser.add_argument(
        "--budget", type=int, default=None,
        help="rendered-character bound for --print-injection (whole entries)",
    )

    args = parser.parse_args()

    if args.print_injection:
        if args.budget is None or args.budget < 0:
            print(
                "ERROR: --print-injection requires --budget <non-negative int> "
                "(the mechanism enforces an explicit bound; the numeric "
                "session-begin value lands with slice three)",
                file=sys.stderr,
            )
            return 2
        return mode_injection(args)
    if args.check:
        return mode_check(args)
    return mode_rebuild(args)


if __name__ == "__main__":
    sys.exit(main())
