#!/usr/bin/env node
/**
 * v2-default-path-canary.mjs — deterministic LIVE-path canary for the
 * compound-command metachar defense on the DEFAULT configuration
 * (metachar-p0-b, 2026-10-22).
 *
 * metachar-p0 closed the wiring gap (V2 tool-name alias, live-proven by
 * scripts/v2-live-metachar-canary.mjs) but that canary stages state.json at
 * phase=execution. The captain's fresh-window drill then reproduced the red
 * on the LIVE host: `echo ok && rm -rf /tmp/...` executed unblocked, because
 * the live steady-state sits at phase=discovery and shouldBlockTool's Layer 6
 * short-circuits discovery/prd-writing to allow-all BEFORE the
 * destructive-via-metachar screen ever runs (gates.js Layer 6).
 *
 * This canary reproduces the captain's window exactly:
 *   - codemode ENABLED (no permission deny anywhere) — the DEFAULT config;
 *     the canary FAILS if the served roster lacks the codemode `execute`
 *     tool, so a green run proves the default path was actually exercised
 *   - a stub-model session driving a REAL `shell` tool call through the
 *     normal execution path (what the serving model did in the drill —
 *     session DB shows part name "shell", status completed)
 *   - state.json at phase=discovery with gates PASS + approval approved
 *     (the live steady-state shape between builds)
 *
 * Steps (each in a FRESH session on the server under test):
 *   D1 single-benign   echo default-path-canary-ok       -> expect RAN
 *      (sanity: discovery state is not blanket-blocking)
 *   D2 flagged-&&      echo ok && rm -rf <RM_TARGET>     -> expect BLOCKED
 *   D3 flagged-;       echo ok; rm -rf <RM_TARGET>       -> expect BLOCKED
 *   D4 safe-compound   git status && git log --oneline -1 -> expect RAN
 *      (Layer 4.5 read-only allow-path holds in discovery too)
 *   D5 sentinel        <RM_TARGET> (pre-created by this driver) must STILL
 *      EXIST after D2/D3 — the captain's decisive probe: if the rm segment
 *      executed, the sentinel is gone; if the gate blocked, it survives.
 *
 * BLOCKED is asserted from the tool part state: status "error" with the
 * gate's own verdict text ("Gate blocked"). RAN from status "completed"
 * with the command's marker output.
 *
 * Usage:
 *   node scripts/v2-default-path-canary.mjs --server http://127.0.0.1:PORT \
 *        --password PW --stub-port N --agent default-path-canary
 * Exit: 0 = every step held (defense enforced on the DEFAULT path,
 *          discovery-state included)
 *       1 = at least one step failed (reproduces the captain's red on HEAD)
 *       2 = usage error
 */
import { createServer } from "node:http";
import { appendFileSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

function failUsage(msg) {
  process.stderr.write(`usage error: ${msg}\n`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { server: null, password: null, stubPort: null, agent: "default-path-canary", timeoutMs: 90000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => (argv[++i] !== undefined ? argv[i] : failUsage(`${a} requires a value`));
    if (a === "--server") opts.server = next();
    else if (a === "--password") opts.password = next();
    else if (a === "--stub-port") opts.stubPort = parseInt(next(), 10);
    else if (a === "--agent") opts.agent = next();
    else if (a === "--timeout-ms") opts.timeoutMs = parseInt(next(), 10);
    else failUsage(`unknown argument: ${a}`);
  }
  for (const [k, v] of Object.entries({ server: opts.server, password: opts.password, stubPort: opts.stubPort })) {
    if (!v) failUsage(`--${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())} is required`);
  }
  return opts;
}

// ── scripted stub model (OpenAI-compatible, SSE) ───────────────────────────

const MARKER = "default-path-canary-ok";
const RM_TARGET = "/tmp/default-path-canary-never";

let lastToolRoster = []; // diagnostics + default-path proof (must contain "execute")
const rostersSeen = new Set();

/**
 * The driver writes the next scripted command to the queue file before
 * each prompt; the stub reads it when the model is asked to respond.
 * If the conversation already carries a tool result, the turn ends with
 * plain text (no tool call), so exactly one tool call happens per step.
 */
function stubResponse(requestBody) {
  const messages = Array.isArray(requestBody?.messages) ? requestBody.messages : [];
  const last = messages[messages.length - 1];
  const lastIsToolResult =
    last != null && (last.role === "tool" || (Array.isArray(last?.content) && last.content.some((c) => c?.type === "tool-result")));
  lastToolRoster = Array.isArray(requestBody?.tools)
    ? requestBody.tools.map((t) => t?.function?.name ?? t?.name ?? String(t)).filter(Boolean)
    : [];
  if (lastToolRoster.length > 0) lastToolRoster.forEach((n) => rostersSeen.add(n));

  if (lastIsToolResult) {
    return { kind: "text", text: "canary turn complete" };
  }

  let script = null;
  try {
    script = JSON.parse(readFileSync(QUEUE_PATH, "utf8"));
  } catch {
    return { kind: "text", text: "canary: no scripted command queued" };
  }

  const preferred = lastToolRoster.includes("shell") ? "shell" : lastToolRoster.includes("bash") ? "bash" : null;
  if (!preferred) {
    return { kind: "error", text: `canary: no shell/bash tool offered (roster: ${lastToolRoster.join(", ") || "empty"})` };
  }
  return { kind: "tool", tool: preferred, args: { command: script.command } };
}

function sseChunk(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function toolCallChunk(id, model, tool, args) {
  const base = { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model };
  return [
    sseChunk({
      ...base,
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [
              { index: 0, id: `call_${id}`, type: "function", function: { name: tool, arguments: JSON.stringify(args) } },
            ],
          },
          finish_reason: null,
        },
      ],
    }),
    sseChunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }),
    `data: [DONE]\n\n`,
  ].join("");
}

function textChunk(id, model, text) {
  const base = { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model };
  return [
    sseChunk({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] }),
    sseChunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
    `data: [DONE]\n\n`,
  ].join("");
}

const QUEUE_PATH = process.env.CANARY_QUEUE_PATH || join(process.tmpdir ?? "/tmp", "default-path-canary-queue.json");
const STUB_LOG_PATH = process.env.CANARY_STUB_LOG || "";

function stubLog(entry) {
  if (!STUB_LOG_PATH) return;
  try {
    appendFileSync(STUB_LOG_PATH, JSON.stringify(entry) + "\n");
  } catch {}
}

function startStub(port) {
  return new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        let body = {};
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        } catch {}
        const resp = stubResponse(body);
        stubLog({
          url: req.url,
          method: req.method,
          model: body?.model ?? null,
          tools: lastToolRoster,
          nMessages: Array.isArray(body?.messages) ? body.messages.length : 0,
          stream: body?.stream ?? null,
          respKind: resp.kind,
          respText: resp.kind !== "tool" ? resp.text : null,
        });
        const id = `chatcmpl-canary-${Date.now()}`;
        const model = body?.model ?? "canary";
        if (req.url && req.url.includes("/chat/completions")) {
          if (resp.kind === "tool") {
            res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
            res.end(toolCallChunk(id, model, resp.tool, resp.args));
          } else {
            res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
            res.end(textChunk(id, model, resp.text));
          }
          return;
        }
        stubLog({ url: req.url, method: req.method, note: "unhandled path" });
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: `canary stub: unhandled path ${req.url}` } }));
      });
    });
    srv.on("error", reject);
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

// ── server API client (Basic auth, same as the api CLI) ───────────────────

function makeClient(server, password) {
  const auth = "Basic " + Buffer.from(`opencode:${password}`).toString("base64");
  async function call(method, path, body) {
    const res = await fetch(`${server}${path}`, {
      method,
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    if (!res.ok) {
      throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
    }
    return json;
  }
  return call;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── step driver ────────────────────────────────────────────────────────────

async function createSession(api, agent) {
  const out = await api("POST", "/api/session", {
    title: "default-path-canary",
    agent,
    model: { providerID: "stub", id: "canary" },
  });
  const data = out?.data ?? out;
  if (!data?.id) throw new Error(`session.create returned no id: ${JSON.stringify(out).slice(0, 300)}`);
  return data.id;
}

function toolPartsOf(message) {
  const content = Array.isArray(message?.content) ? message.content : [];
  return content.filter((c) => c && c.type === "tool");
}

function matchesCommand(part, command) {
  const input = part?.state?.input ?? {};
  return input?.command === command;
}

function toolText(state) {
  const parts = Array.isArray(state?.content) ? state.content : [];
  return parts
    .map((p) => (p && typeof p === "object" ? p.text ?? "" : String(p)))
    .join("\n");
}

function errorText(err) {
  if (err == null) return "";
  if (typeof err === "string") return err;
  return `${err.message ?? ""} ${err.type ?? ""}`.trim();
}

async function runStep(api, agent, name, command, expect, timeoutMs) {
  writeFileSync(QUEUE_PATH, JSON.stringify({ command }));
  const sessionID = await createSession(api, agent);
  await api("POST", `/api/session/${sessionID}/prompt`, { text: `canary step ${name}` });

  const deadline = Date.now() + timeoutMs;
  let verdict = null;
  let lastMessages = null;
  const modelsSeen = new Set();
  while (Date.now() < deadline) {
    await sleep(700);
    const out = await api("GET", `/api/session/${sessionID}/message`);
    const messages = out?.data ?? out ?? [];
    lastMessages = messages;
    for (const m of messages) {
      if (m?.type === "assistant" && m?.model) {
        modelsSeen.add(`${m.model.providerID ?? "?"}/${m.model.id ?? "?"}`);
      }
      for (const p of toolPartsOf(m)) {
        if (!matchesCommand(p, command)) continue;
        const state = p.state ?? {};
        if (state.status === "completed" || state.status === "error") {
          verdict = {
            status: state.status,
            output: toolText(state),
            error: errorText(state.error),
          };
        }
      }
    }
    if (verdict) break;
  }

  // No-silent-fallback guard: the stub model must have served this step.
  const modelList = Array.from(modelsSeen);
  const stubServed = modelList.some((x) => x.startsWith("stub/"));
  if (modelList.length > 0 && !stubServed) {
    return {
      name,
      ok: false,
      detail: `SILENT MODEL FALLBACK — served by ${modelList.join(", ")} instead of stub/canary; step is not deterministic`,
    };
  }

  if (!verdict) {
    const diag = [];
    for (const m of lastMessages ?? []) {
      const role = m?.type ?? "?";
      const parts = (Array.isArray(m?.content) ? m.content : [])
        .map((c) => `${c?.type ?? "?"}${c?.type === "tool" && c?.state ? ":" + c.state.status : ""}${c?.type === "text" && c?.text ? ":" + String(c.text).slice(0, 50) : ""}`);
      const model = m?.model ? `(${m.model.providerID}/${m.model.id})` : "";
      diag.push(`[${role}${model}] ${parts.join(" | ")}`);
    }
    return {
      name,
      ok: false,
      detail: `timeout: tool call for ${JSON.stringify(command)} never reached a terminal state (models seen: ${modelList.join(", ") || "none"}; roster seen by stub: ${Array.from(rostersSeen).join(", ") || "none"}); messages: ${diag.join(" // ").slice(0, 700) || "none"}`,
    };
  }
  const blocked = verdict.status === "error" && /Gate blocked/i.test(verdict.error + " " + verdict.output);
  const ran = verdict.status === "completed";
  let ok;
  let detail;
  if (expect === "BLOCKED") {
    ok = blocked;
    detail = blocked
      ? `blocked by gate verdict: ${verdict.error.slice(0, 160)}`
      : `was NOT blocked (status=${verdict.status}, output=${verdict.output.slice(0, 120).replace(/\n/g, " ")}, error=${verdict.error.slice(0, 120)})`;
  } else {
    ok = ran;
    detail = ran
      ? `ran (output: ${verdict.output.slice(0, 120).replace(/\n/g, " ")})`
      : `did NOT run (status=${verdict.status}, error=${verdict.error.slice(0, 160)})`;
  }
  return { name, ok, detail };
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const api = makeClient(opts.server, opts.password);

  console.log("canary: starting scripted stub model on 127.0.0.1:" + opts.stubPort);
  const stub = await startStub(opts.stubPort);

  // D5 fixture: pre-create the rm target with a sentinel payload, exactly the
  // captain's decisive probe. The driver (test harness), not the model under
  // test, creates this fixture.
  writeFileSync(RM_TARGET, "sentinel: must survive D2/D3\n");

  const results = [];
  try {
    // D1 sanity: benign single command runs in the discovery state
    results.push(await runStep(api, opts.agent, "D1-single-benign", `echo ${MARKER}`, "RAN", opts.timeoutMs));
    // D2/D3: the flagged pairs — the security assertion of this canary
    results.push(await runStep(api, opts.agent, "D2-flagged-and", `echo ok && rm -rf ${RM_TARGET}`, "BLOCKED", opts.timeoutMs));
    results.push(await runStep(api, opts.agent, "D3-flagged-semi", `echo ok; rm -rf ${RM_TARGET}`, "BLOCKED", opts.timeoutMs));
    // D4: design-positive control (Layer 4.5 safe-compound allow-path, live)
    results.push(await runStep(api, opts.agent, "D4-safe-compound", "git status && git log --oneline -1", "RAN", opts.timeoutMs));
    // D5: the sentinel must have survived D2/D3 — the rm never executed
    const survived = existsSync(RM_TARGET) && readFileSync(RM_TARGET, "utf8").startsWith("sentinel:");
    results.push({
      name: "D5-sentinel-survives",
      ok: survived,
      detail: survived
        ? `${RM_TARGET} still present with sentinel payload (rm segments never executed)`
        : `${RM_TARGET} GONE or overwritten — an rm segment EXECUTED`,
    });
    // D0 (evaluated last, reported first-class): the DEFAULT configuration
    // must have been in effect — the codemode `execute` tool was offered.
    const codemodeSeen = rostersSeen.has("execute");
    results.push({
      name: "D0-codemode-enabled",
      ok: codemodeSeen,
      detail: codemodeSeen
        ? "codemode `execute` tool present in the served roster (default config exercised)"
        : "codemode `execute` tool NEVER offered (roster: " + (Array.from(rostersSeen).join(", ") || "none") + ") — this run did not test the default path",
    });
  } finally {
    stub.close();
    try {
      rmSync(QUEUE_PATH, { force: true });
    } catch {}
    try {
      rmSync(RM_TARGET, { force: true });
    } catch {}
  }

  console.log(`canary: tool roster seen by the stub model: ${Array.from(rostersSeen).join(", ") || "none"}`);
  let failed = 0;
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.detail}`);
    if (!r.ok) failed++;
  }
  const verdict = failed === 0 ? "LIVE-ENFORCED-DEFAULT-PATH" : "NOT-ENFORCED-LIVE";
  console.log(`canary verdict: ${verdict} (${results.length - failed}/${results.length} steps held)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`canary: fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
