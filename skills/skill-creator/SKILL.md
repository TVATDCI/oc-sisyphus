---
name: skill-creator
description: "Creates new skills and iteratively improves existing ones via test-driven refinement. (1) Use when the user has a skill idea or wants to draft a new SKILL.md from scratch. (2) Use to edit, optimize, or improve an existing skill. (3) Use to run evals, benchmark variance, or optimize a skill's description for better triggering accuracy. Triggers: 'skill idea', 'draft skill', 'create a skill', 'improve this skill', 'optimize skill description', 'test the skill', 'benchmark this skill', 'iterate on the skill', 'make this skill better', 'skill is undertriggering', 'new skill'. Always evaluates via quantitative evals plus qualitative review before claiming improvement. Not for: general code generation, documentation writing, project planning (use discovery-orchestrator), or one-off scripts."
license: MIT
compatibility: opencode
triggers:
  - "skill idea"
  - "draft skill"
  - "existing skill to improve"
mode: human-in-loop
inputs:
  - "skill idea"
  - "draft skill"
  - "existing skill to improve"
outputs:
  - "SKILL.md"
  - "eval results"
  - "benchmark report"
  - "improved skill"
produces_artifacts:
  - "~/.config/opencode/skills/*/SKILL.md"
requires_artifacts:
gates:
  - "user evaluation of skill performance"
metadata:
  category: authoring
  complexity: advanced
  version: 1.0.0
---



# Skill Creator

A skill for creating new skills and iteratively improving them.

At a high level, the process of creating a skill goes like this:

- Decide what you want the skill to do and roughly how it should do it
- Write a draft of the skill
- Create a few test prompts and run opencode-with-access-to-the-skill on them
- Help the user evaluate the results both qualitatively and quantitatively
  - While the runs happen in the background, draft some quantitative evals if there aren't any (if there are some, you can either use as is or modify if you feel something needs to change about them). Then explain them to the user (or if they already existed, explain the ones that already exist)
- Rewrite the skill based on feedback from the user's evaluation of the results (and also if there are any glaring flaws that become apparent from the quantitative benchmarks)
- Repeat until you're satisfied
- Expand the test set and try again at larger scale

Your job when using this skill is to figure out where the user is in this process and then jump in and help them progress through these stages. So for instance, maybe they're like "I want to make a skill for X". You can help narrow down what they mean, write a draft, write the test cases, figure out how they want to evaluate, run all the prompts, and repeat.

On the other hand, maybe they already have a draft of the skill. In this case you can go straight to the eval/iterate part of the loop.

Of course, you should always be flexible and if the user is like "I don't need to run a bunch of evaluations, just vibe with me", you can do that instead.

Then after the skill is done (but again, the order is flexible), you can also run the skill description improver, which we have a whole separate script for, to optimize the triggering of the skill.

## Identity & Scope

**Purpose:** Create new skills, modify/improve existing skills, measure skill performance, and optimize description triggering.

**Triggers:** "skill idea", "draft skill", "existing skill to improve", "create skill", "improve skill", "optimize skill description"

**Not For:**
- General code generation (use a coding agent)
- Documentation writing (use a writing skill)
- Project planning (use discovery-orchestrator)
- One-off scripts or tools (skills are for repeatable workflows)

**Entry Criteria:**
- [ ] User has a skill idea (or existing skill to improve)
- [ ] User is willing to engage in iterative refinement
- [ ] (Optional) Test cases can be defined if outputs are objectively verifiable

**Produces:**
- `SKILL.md` (the skill specification)
- Eval results (quantitative + qualitative)
- Benchmark report (variance analysis)
- Improved skill (after iteration)

**Next if Approved:**
- Skill ready → user evaluates performance
- Description optimization → run blind comparison
- Package → present to user for use

**Communication Principles (for all models):**
- Pay attention to context cues to understand the user's familiarity with coding jargon
- In the default case, "evaluation" and "benchmark" are borderline but OK; "JSON" and "assertion" need user cues
- Briefly explain terms if in doubt; feel free to clarify with short definitions
- Be flexible — if user says "don't run evals, just vibe with me", do that instead
- Help user progress through the stages, don't dictate them

## Hard Constraints (NEVER/MUST)

- **No invented test prompts** — every eval case must be a real example the user could provide
- **5-case eval minimum** — per the eval-first discipline (§6 of Main-vault/AGENTS.md), every skill must ship with at least 5 test cases (1 control, 2-3 edge failures, 1 capability boundary)
- **Overlap check required** — before creating a new skill, consult `system-reference` for similar upstream features; peaceful overlap is OK but document why
- **Output format is the skill's contract** — every skill must specify its output format up-front (JSON schema, file path, etc.)
- **User evaluation gates iteration** — don't auto-iterate without user feedback; the human is in the loop
- **Boundary: do not modify other skills without explicit user request** — this skill CREATES new skills, not silently edits existing ones
- **Description optimization requires blind comparison** — never claim description improvement without variance data
- **Package before present** — never hand the user an unpackaged skill; always run the packaging step
- **Validation before test cases** — do not proceed to test cases until validation passes; fix FAILs first
- **No `/skill-test`** — do NOT use `/skill-test` or any other testing skill; this skill has its own eval workflow
- **Use generate_review.py for viewer** — always use generate_review.py to create the viewer; do not write custom HTML
- **Spawn all runs in the same turn** — don't spawn with-skill runs first and come back for baselines later; launch everything at once
- **Safety & trust** — do not include malware, misleading skills, or facilitate unauthorized access; be transparent about what the skill does, tools it uses, and side effects

## Core Workflow (Summary)

The 5-stage skill creation pipeline — see `## Detailed Stages` below for per-stage procedures.
1. **Capture Intent** — Extract answers from conversation history (tools used, sequence, corrections, formats); fill gaps with user
2. **Interview and Research** — Ask about edge cases, I/O formats, examples, success criteria, dependencies; research in parallel
3. **Write the SKILL.md** — Fill in 6 components (Context, Instruction, Input, Output, Examples, Constraints)
4. **Run and Evaluate Test Cases** — Background runs, quantitative evals, qualitative user review
5. **Iterate** — Rewrite based on feedback; expand test set at larger scale; loop until satisfied

**Optional final stage:** Description Optimization (run blind comparison to optimize skill triggering)

**Modes:** Default (test-driven iteration) vs Vibe (no evals, just discuss with user)

## Tool Usage

- **Read tools**: Read user conversation, existing skills, vault pages for context
- **Write tools**: Create SKILL.md in `~/.config/opencode/skills/*/`
- **Bash tools**: Run evals, benchmark variance, package skills
- **Task tool**: Delegate to subagents for parallel research (e.g., finding similar skills)
- **Skill-tool**: Load existing skills like `system-reference` for overlap checks

## Boundaries

- **Do NOT modify existing skills silently** — only with explicit user request
- **Do NOT auto-iterate without user feedback** — human-in-loop is the default mode
- **Do NOT skip the packaging step** — every skill must be packaged before present
- **Do NOT claim improvements without data** — variance analysis is the standard of evidence

## Communication Style (cross-cutting)

- Match user's jargon level
- Brief explanations for unfamiliar terms
- Be flexible about workflow ordering
- Don't preach the process — help user progress

## Package and Present

After the skill passes evaluation and the user is satisfied, package it for distribution:

```bash
python -m scripts.package_skill <skill-name>
```

This creates a compressed `.skill` file from the skill directory, ready for sharing or installation on another opencode instance. The output path is printed to stdout.

## Reference files

The agents/ directory contains instructions for specialized subagents. Read them when you need to spawn the relevant subagent.

- `agents/grader.md` — How to evaluate assertions against outputs
- `agents/comparator.md` — How to do blind A/B comparison between two outputs
- `agents/analyzer.md` — How to analyze why one version beat another

The references/ directory has additional documentation:
- `references/schemas.md` — JSON structures for evals.json, grading.json, etc.

Repeating one more time the core loop here for emphasis:

- Figure out what the skill is about
- Draft or edit the skill
- Run opencode-with-access-to-the-skill on test prompts
- With the user, evaluate the outputs:
  - Create benchmark.json and run `eval-viewer/generate_review.py` to help the user review them
  - Run quantitative evals
- Repeat until you and the user are satisfied

Please add steps to your TodoList to make sure you don't forget. Specifically put "Create evals JSON and run `eval-viewer/generate_review.py` so human can review test cases" in your TodoList to make sure it happens.

Good luck!

---

## Detailed Stages

### Creating a skill

#### Capture Intent

Start by understanding the user's intent. The current conversation might already contain a workflow the user wants to capture (e.g., they say "turn this into a skill"). If so, extract answers from the conversation history first — the tools used, the sequence of steps, corrections the user made, input/output formats observed. The user may need to fill the gaps, and should confirm before proceeding to the next step.

1. What should this skill enable the agent to do?
2. When should this skill trigger? (what user phrases/contexts)
3. What's the expected output format?
4. **Overlap check**: What existing upstream OpenCode feature or local skill/agent covers similar ground? (Consult `system-reference` → "Upstream OpenCode Routing" section.) If an overlap exists, why is a new skill still needed? This is advisory — peaceful overlap is fine if the custom version adds workflow value the built-in doesn't replace.
5. Should we set up test cases to verify the skill works? Skills with objectively verifiable outputs (file transforms, data extraction, code generation, fixed workflow steps) benefit from test cases. Skills with subjective outputs (writing style, art) often don't need them. Suggest the appropriate default based on the skill type, but let the user decide.

#### Interview and Research

Proactively ask questions about edge cases, input/output formats, example files, success criteria, and dependencies. Wait to write test prompts until you've got this part ironed out.

Check available tools - if useful for research (searching docs, finding similar skills, looking up best practices), research in parallel via subagents if available, otherwise inline. Come prepared with context to reduce burden on the user.

#### Write the SKILL.md

Based on the user interview, fill in these components:

- **name**: Skill identifier (lowercase, alphanumeric with hyphens)
- **description**: When to trigger, what it does. This is the primary triggering mechanism - include both what the skill does AND specific contexts for when to use it. All "when to use" info goes here, not in the body. Note: agents have a tendency to "undertrigger" skills -- to not use them when they'd be useful. To combat this, please make the skill descriptions a little bit "pushy". So for instance, instead of "How to build a simple fast dashboard to display internal data.", you might write "How to build a simple fast dashboard to display internal data. Make sure to use this skill whenever the user mentions dashboards, data visualization, internal metrics, or wants to display any kind of company data, even if they don't explicitly ask for a 'dashboard.'"
- **compatibility**: Required tools, dependencies (optional, rarely needed)
- **the rest of the skill :)**

#### Skill Anatomy & Progressive Disclosure

A skill uses a three-level loading system for context economy — the agent only loads what it needs, when it needs it.

| Level | What | When Loaded | Size Target |
|-------|------|-------------|-------------|
| 1 — Metadata | name + description from frontmatter | Always in context | ~100 words |
| 2 — Body | Full SKILL.md instructions | When skill triggers | <500 lines |
| 3 — Resources | scripts/, references/, assets/ | On demand from body | Unlimited |

**Reference:** See `references/skill-writing-guide.md` → "Anatomy of a Skill" and "Progressive Disclosure" for the directory structure, key patterns, and domain organization examples.

#### Skill Writing Guide

**Reference:** For detailed guidance on writing patterns and test cases, read `references/skill-writing-guide.md`.

**Quick checklist:**
- [ ] Name: lowercase, alphanumeric with hyphens
- [ ] Description: include when to trigger + what it does (be "pushy" to avoid undertriggering)
- [ ] Follow the 3-level progressive disclosure model — SKILL.md body <500 lines
- [ ] Use imperative form in instructions
- [ ] Explain the **why**, not just the **what**
- [ ] Include **5 test cases** in `evals/evals.json`: 1 control, 3 edge failures, 1 capability boundary (per `Main-vault/AGENTS.md` §6 and Hard Constraint #2 above). The capability boundary case (case 5) is load-bearing — it catches what the skill DOESN'T know.
- [ ] Bundle repetitive logic into scripts/ instead of asking the model to reinvent it

#### Scaffold the skill (optional)

To create a new skill directory with the correct structure and auto-validate:

```bash
python ~/.config/opencode/skills/skill-creator/scripts/init_skill.py <skill-name>
```

This creates the skill directory, generates a minimal SKILL.md, and immediately runs validation. Fix any FAILs before editing the SKILL.md.

#### Validate the skill before proceeding

After writing or editing the SKILL.md, validation runs automatically if you used `init_skill.py`. If you created the skill manually, run validation before any test cases:

```bash
bash ~/.config/opencode/scripts/validate-skills.sh <skill-name>
```

Or validate all skills:

```bash
bash ~/.config/opencode/scripts/validate-skills.sh --all
```

This checks:
- SKILL.md exists
- YAML frontmatter is present
- Required fields exist (name, description, compatibility)
- No forbidden files inside skill dir (README.md, CHANGELOG.md)
- SKILL.md line count (WARN if >500 lines)
- Agent permission format is valid (websearch/webfetch must be scalar, not objects)

**Do not proceed to test cases until validation passes.** If validation reports FAIL, fix the issue first. WARNs are advisory. For the over-500-line WARN specifically, the validator recognizes a documented exception: add a `## Length Exception` section to the end of SKILL.md explaining why the file is genuinely long and what (if anything) has already been extracted to `references/`. With that section present (matched by `^## Length Exception\s*$`), the validator emits `PASS (documented exception: ...)` instead of WARN. Use this only after reference extraction and changelog removal are already done — the section is a "this is irreducible" attestation, not a substitute for pruning.

#### Safety & Trust

A skill's contents should not surprise the user in their intent if described. This means:

- Do not include malware, exploit code, or anything that compromises system security.
- Do not create misleading skills — ones that pretend to do one thing but do another.
- Do not facilitate unauthorized access, data exfiltration, or malicious activity.
- Be transparent about what the skill does, what tools it uses, and what side effects it may have (file creation, network access, shell execution).

Validation checks structure. This principle checks intent. Both are required.

### Running and evaluating test cases

This section is one continuous sequence — don't stop partway through. Do NOT use `/skill-test` or any other testing skill.

Put results in `<skill-name>-workspace/` as a sibling to the skill directory. Within the workspace, organize results by iteration (`iteration-1/`, `iteration-2/`, etc.) and within that, each test case gets a directory (`eval-0/`, `eval-1/`, etc.). Don't create all of this upfront — just create directories as you go.

> **Cleanup:** After an iteration is validated, archive or delete older `iteration-N/` directories — keep only the latest validated iteration + `evals.json` in the skill root.

#### Step 1: Spawn all runs (with-skill AND baseline) in the same turn

For each test case, spawn two subagents in the same turn — one with the skill, one without. This is important: don't spawn the with-skill runs first and then come back for baselines later. Launch everything at once so it all finishes around the same time.

**With-skill run:**

```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any, or "none">
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- Outputs to save: <what the user cares about — e.g., "the .docx file", "the final CSV">
```

**Baseline run** (same prompt, but the baseline depends on context):
- **Creating a new skill**: no skill at all. Same prompt, no skill path, save to `without_skill/outputs/`.
- **Improving an existing skill**: the old version. Before editing, snapshot the skill (`cp -r <skill-path> <workspace>/skill-snapshot/`), then point the baseline subagent at the snapshot. Save to `old_skill/outputs/`.

Write an `eval_metadata.json` for each test case (assertions can be empty for now). Give each eval a descriptive name based on what it's testing — not just "eval-0". Use this name for the directory too. If this iteration uses new or modified eval prompts, create these files for each new eval directory — don't assume they carry over from previous iterations.

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

#### Step 2: While runs are in progress, draft assertions

Don't just wait for the runs to finish — you can use this time productively. Draft quantitative assertions for each test case and explain them to the user. If assertions already exist in `evals/evals.json`, review them and explain what they check.

Good assertions are objectively verifiable and have descriptive names — they should read clearly in the benchmark viewer so someone glancing at the results immediately understands what each one checks. Subjective skills (writing style, design quality) are better evaluated qualitatively — don't force assertions onto things that need human judgment.

Update the `eval_metadata.json` files and `evals/evals.json` with the assertions once drafted. Also explain to the user what they'll see in the viewer — both the qualitative outputs and the quantitative benchmark.

#### Step 3: As runs complete, capture timing data

When each subagent task completes, you receive a notification containing `total_tokens` and `duration_ms`. Save this data immediately to `timing.json` in the run directory:

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

This is the only opportunity to capture this data — it comes through the task notification and isn't persisted elsewhere. Process each notification as it arrives rather than trying to batch them.

#### Step 4: Grade, aggregate, and launch the viewer

Once all runs are done:

1. **Grade each run** — spawn a grader subagent (or grade inline) that reads `agents/grader.md` and evaluates each assertion against the outputs. Save results to `grading.json` in each run directory. The grading.json expectations array must use the fields `text`, `passed`, and `evidence` (not `name`/`met`/`details` or other variants) — the viewer depends on these exact field names. For assertions that can be checked programmatically, write and run a script rather than eyeballing it — scripts are faster, more reliable, and can be reused across iterations.

2. **Aggregate into benchmark** — run the aggregation script from the skill-creator directory:
   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   ```
   This produces `benchmark.json` and `benchmark.md` with pass_rate, time, and tokens for each configuration, with mean ± stddev and the delta. If generating benchmark.json manually, see `references/schemas.md` for the exact schema the viewer expects.
   Put each with_skill version before its baseline counterpart.

3. **Do an analyst pass** — read the benchmark data and surface patterns the aggregate stats might hide. See `agents/analyzer.md` (the "Analyzing Benchmark Results" section) for what to look for — things like assertions that always pass regardless of skill (non-discriminating), high-variance evals (possibly flaky), and time/token tradeoffs.

4. **Launch the viewer** with both qualitative outputs and quantitative data.

   Choose the right mode for your environment:

   **If a browser is available (default):**
   ```bash
   nohup python <skill-creator-path>/eval-viewer/generate_review.py \
     <workspace>/iteration-N \
     --skill-name "my-skill" \
     --benchmark <workspace>/iteration-N/benchmark.json \
     > /dev/null 2>&1 &
   VIEWER_PID=$!
   ```
   For iteration 2+, also pass `--previous-workspace <workspace>/iteration-<N-1>`.

   **If no display/headless:** Use `--static <output_path>` to write a standalone HTML file instead of starting a server:
   ```bash
   python <skill-creator-path>/eval-viewer/generate_review.py \
     <workspace>/iteration-N \
     --skill-name "my-skill" \
     --benchmark <workspace>/iteration-N/benchmark.json \
     --static <workspace>/iteration-N/review.html
   ```
   Feedback will be downloaded as a `feedback.json` file when the user clicks "Submit All Reviews". After download, copy `feedback.json` into the workspace directory for the next iteration to pick up. There is no server process to clean up in headless mode.

   **Cleanup:** When the user is done reviewing and you've read the feedback, kill the viewer server if one was started:
   ```bash
   kill $VIEWER_PID 2>/dev/null
   ```

   **Important:** Always use generate_review.py to create the viewer. Do not write custom HTML.

5. **Tell the user** something like: "I've opened the results in your browser. There are two tabs — 'Outputs' lets you click through each test case and leave feedback, 'Benchmark' shows the quantitative comparison. When you're done, come back here and let me know."

#### What the user sees in the viewer

The "Outputs" tab shows one test case at a time:
- **Prompt**: the task that was given
- **Output**: the files the skill produced, rendered inline where possible
- **Previous Output** (iteration 2+): collapsed section showing last iteration's output
- **Formal Grades** (if grading was run): collapsed section showing assertion pass/fail
- **Feedback**: a textbox that auto-saves as they type
- **Previous Feedback** (iteration 2+): their comments from last time, shown below the textbox

The "Benchmark" tab shows the stats summary: pass rates, timing, and token usage for each configuration, with per-eval breakdowns and analyst observations.

Navigation is via prev/next buttons or arrow keys. When done, they click "Submit All Reviews" which saves all feedback to `feedback.json`.

#### Step 5: Read the feedback

When the user tells you they're done, read `feedback.json`:

```json
{
  "reviews": [
    {"run_id": "eval-0-with_skill", "feedback": "the chart is missing axis labels", "timestamp": "..."},
    {"run_id": "eval-1-with_skill", "feedback": "", "timestamp": "..."},
    {"run_id": "eval-2-with_skill", "feedback": "perfect, love this", "timestamp": "..."}
  ],
  "status": "complete"
}
```

Empty feedback means the user thought it was fine. Focus your improvements on the test cases where the user had specific complaints.

### Improving the skill

This is the heart of the loop. You've run the test cases, the user has reviewed the results, and now you need to make the skill better based on their feedback.

#### How to think about improvements

1. **Generalize from the feedback.** The big picture thing that's happening here is that we're trying to create skills that can be used a million times (maybe literally, maybe even more who knows) across many different prompts. Here you and the user are iterating on only a few examples over and over again because it helps move faster. The user knows these examples in and out and it's quick for them to assess new outputs. But if the skill you and the user are codeveloping works only for those examples, it's useless. Rather than put in fiddly overfitty changes, or oppressively constrictive MUSTs, if there's some stubborn issue, you might try branching out and using different metaphors, or recommending different patterns of working. It's relatively cheap to try and maybe you'll land on something great.

2. **Keep the prompt lean.** Remove things that aren't pulling their weight. Make sure to read the transcripts, not just the final outputs — if it looks like the skill is making the model waste a bunch of time doing things that are unproductive, you can try getting rid of the parts of the skill that are making it do that and seeing what happens.

3. **Explain the why.** Try hard to explain the **why** behind everything you're asking the model to do. Today's LLMs are *smart*. They have good theory of mind and when given a good harness can go beyond rote instructions and really make things happen. Even if the feedback from the user is terse or frustrated, try to actually understand the task and why the user is writing what they wrote, and what they actually wrote, and then transmit this understanding into the instructions. If you find yourself writing ALWAYS or NEVER in all caps, or using super rigid structures, that's a yellow flag — if possible, reframe and explain the reasoning so that the model understands why the thing you're asking for is important. That's a more humane, powerful, and effective approach.

4. **Look for repeated work across test cases.** Read the transcripts from the test runs and notice if the subagents all independently wrote similar helper scripts or took the same multi-step approach to something. If all 3 test cases resulted in the subagent writing a `create_docx.py` or a `build_chart.py`, that's a strong signal the skill should bundle that script. Write it once, put it in `scripts/`, and tell the skill to use it. This saves every future invocation from reinventing the wheel.

This task is pretty important (we are trying to create billions a year in economic value here!) and your thinking time is not the blocker; take your time and really mull things over. I'd suggest writing a draft revision and then looking at it anew and making improvements. Really do your best to get into the head of the user and understand what they want and need.

#### The iteration loop

After improving the skill:

1. Apply your improvements to the skill
2. Rerun all test cases into a new `iteration-<N+1>/` directory, including baseline runs. If you're creating a new skill, the baseline is always `without_skill` (no skill) — that stays the same across iterations. If you're improving an existing skill, use your judgment on what makes sense as the baseline: the original version the user came in with, or the previous iteration.
3. Launch the reviewer with `--previous-workspace` pointing at the previous iteration
4. Wait for the user to review and tell you they're done
5. Read the new feedback, improve again, repeat

Keep going until:
- The user says they're happy
- The feedback is all empty (everything looks good)
- You're not making meaningful progress

### Advanced: Blind comparison

For situations where you want a more rigorous comparison between two versions of a skill (e.g., the user asks "is the new version actually better?"), there's a blind comparison system. Read `agents/comparator.md` and `agents/analyzer.md` for the details. The basic idea is: give two outputs to an independent agent without telling it which is which, and let it judge quality. Then analyze why the winner won.

This is optional, requires subagents, and most users won't need it. The human review loop is usually sufficient.

### Description Optimization

The description field in SKILL.md frontmatter is the primary mechanism that determines whether the agent invokes a skill. After creating or improving a skill, offer to optimize the description for better triggering accuracy.

#### Step 1: Generate trigger eval queries

Create 20 eval queries — a mix of should-trigger and should-not-trigger. Save as JSON:

```json
[
  {"query": "the user prompt", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
```

The queries must be realistic and something an OpenCode user would actually type. Not abstract requests, but requests that are concrete and specific and have a good amount of detail. For instance, file paths, personal context about the user's job or situation, column names and values, company names, URLs. A little bit of backstory. Some might be in lowercase or contain abbreviations or typos or casual speech. Use a mix of different lengths, and focus on edge cases rather than making them clear-cut (the user will get a chance to sign off on them).

Bad: `"Format this data"`, `"Extract text from PDF"`, `"Create a chart"`

Good: `"ok so my boss just sent me this xlsx file (its in my downloads, called something like 'Q4 sales final FINAL v2.xlsx') and she wants me to add a column that shows the profit margin as a percentage. The revenue is in column C and costs are in column D i think"`

For the **should-trigger** queries (8-10), think about coverage. You want different phrasings of the same intent — some formal, some casual. Include cases where the user doesn't explicitly name the skill or file type but clearly needs it. Throw in some uncommon use cases and cases where this skill competes with another but should win.

For the **should-not-trigger** queries (8-10), the most valuable ones are the near-misses — queries that share keywords or concepts with the skill but actually need something different. Think adjacent domains, ambiguous phrasing where a naive keyword match would trigger but shouldn't, and cases where the query touches on something the skill does but in a context where another tool is more appropriate.

The key thing to avoid: don't make should-not-trigger queries obviously irrelevant. "Write a fibonacci function" as a negative test for a PDF skill is too easy — it doesn't test anything. The negative cases should be genuinely tricky.

#### Step 2: Review with user

Present the eval set to the user for review using the HTML template in `assets/eval_review.html`. Replace the placeholders:
- `__EVAL_DATA_PLACEHOLDER__` → the JSON array of eval items (no quotes around it — it's a JS variable assignment)
- `__SKILL_NAME_PLACEHOLDER__` → the skill's name
- `__SKILL_DESCRIPTION_PLACEHOLDER__` → the skill's current description

Write to a temp file (e.g., `/tmp/eval_review_<skill-name>.html`) and open it. The user can edit queries, toggle should-trigger, add/remove entries, then click "Export Eval Set". The file downloads to `~/Downloads/eval_set.json` — check the Downloads folder for the most recent version in case there are multiple (e.g., `eval_set (1).json`).

This step matters — bad eval queries lead to bad descriptions.

#### Step 3: Run the optimization loop

Tell the user: "This will take some time — I'll run the optimization loop in the background and check on it periodically."

Save the eval set to the workspace, then run in the background:

```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

Use the model ID from your system prompt (the one powering the current session) so the triggering test matches what the user actually experiences.

While it runs, periodically tail the output to give the user updates on which iteration it's on and what the scores look like.

This handles the full optimization loop automatically. It splits the eval set into 60% train and 40% held-out test, evaluates the current description (running each query 3 times to get a reliable trigger rate), then calls the LLM to propose improvements based on what failed. It re-evaluates each new description on both train and test, iterating up to 5 times. When it's done, it opens an HTML report in the browser showing the results per iteration and returns JSON with `best_description` — selected by test score rather than train score to avoid overfitting.

#### How skill triggering works

Understanding the triggering mechanism helps design better eval queries. Skills appear in the agent's `available_skills` list with their name + description, and the agent decides whether to consult a skill based on that description. The important thing to know is that the agent only consults skills for tasks it can't easily handle on its own — simple, one-step queries like "read this PDF" may not trigger a skill even if the description matches perfectly, because the agent can handle them directly with basic tools. Complex, multi-step, or specialized queries reliably trigger skills when the description matches.

This means your eval queries should be substantive enough that the agent would actually benefit from consulting a skill. Simple queries like "read file X" are poor test cases — they won't trigger skills regardless of description quality.

#### Step 4: Apply the result

Take `best_description` from the JSON output and update the skill's SKILL.md frontmatter. Show the user before/after and report the scores.

---

## Length Exception

This SKILL.md exceeds the 500-line guideline. **Reason:** Full skill-development lifecycle — drafting, structural validation, eval-set design, description-optimization loop (`run_loop.py` invocation with 60/40 train/test split), and iteration methodology. The meta-skill describes a multi-stage process that other skills cite (including this one, via L265). **Pruning done:** None — already at the minimum needed to walk a new operator through the eval loop. Validator WARN is expected and accepted per L265 itself.