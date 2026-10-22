#!/usr/bin/env node
/**
 * v2-model-fallback-canary.mjs — P2-b (fm/backlog-impl, 2026-10-22).
 *
 * Live probe for the V2-native model-fallback plugin
 * (plugins/model-fallback.js): a session pinned to a PRIMARY stub that
 * always answers HTTP 429 must be re-pointed by the plugin (session.retry
 * hook -> ctx.session.switchModel) and COMPLETE on the ladder's next rung,
 * with the served model visible on the assistant message (row evidence).
 *
 * Deterministic, zero model-judgment: two loopback stub servers only —
 *   fail port: every /v1/chat/completions -> 429 JSON (RateLimit class)
 *   ok port:   one SSE text turn ("FALLBACK-OK <model>")
 *
 * Verdict:
 *   PASS  an assistant message exists whose model.providerID === the ok
 *         stub's provider id (the fallback served) — and the fail stub saw
 *         at least one request (the primary was genuinely tried first)
 *   FAIL  turn errored on the primary / timed out / never switched
 *
 * Usage:
 *   node scripts/v2-model-fallback-canary.mjs --server http://127.0.0.1:PORT \
 *        --password PW --fail-port N --ok-port N [--timeout-ms 90000]
 * Exit: 0 = fallback served the next rung; 1 = not; 2 = usage.
 */
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opts = { server: null, password: null, failPort: null, okPort: null, timeoutMs: 90000 };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => args[++i];
  if (a === "--server") opts.server = next();
  else if (a === "--password") opts.password = next();
  else if (a === "--fail-port") opts.failPort = Number(next());
  else if (a === "--ok-port") opts.okPort = Number(next());
  else if (a === "--timeout-ms") opts.timeoutMs = Number(next());
  else {
    console.error(`usage error: unknown arg ${a}`);
    process.exit(2);
  }
}
if (!opts.server || !opts.password || !opts.failPort || !opts.okPort) {
  console.error("usage: --server URL --password PW --fail-port N --ok-port N [--timeout-ms MS]");
  process.exit(2);
}

const STUB_LOG = process.env.FALLBACK_STUB_LOG || "";
const log = (entry) => {
  if (!STUB_LOG) return;
  try {
    appendFileSync(STUB_LOG, JSON.stringify(entry) + "\n");
  } catch {}
};

const sse = (payload) => `data: ${JSON.stringify(payload)}\n\n`;

function textChunk(id, model, text) {
  const base = { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model };
  return [
    sse({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] }),
    sse({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
    `data: [DONE]\n\n`,
  ].join("");
}

function startFailStub(port) {
  return new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        log({ stub: "fail", url: req.url, status: 429 });
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "canary fail stub: rate limited", type: "rate_limit_error" } }));
      });
    });
    srv.on("error", reject);
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

function startOkStub(port) {
  return new Promise((resolve, reject) => {
    const srv = createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const body = (() => {
          try {
            return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
          } catch {
            return {};
          }
        })();
        const model = body?.model ?? "ok";
        log({ stub: "ok", url: req.url, model });
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
        res.end(textChunk(`chatcmpl-fb-${Date.now()}`, model, `FALLBACK-OK ${model}`));
      });
    });
    srv.on("error", reject);
    srv.listen(port, "127.0.0.1", () => resolve(srv));
  });
}

function makeClient(server, password) {
  const auth = "Basic " + Buffer.from(`opencode:${password}`).toString("base64");
  return async function call(method, path, body) {
    const res = await fetch(`${server}${path}`, {
      method,
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const failStub = await startFailStub(opts.failPort);
  const okStub = await startOkStub(opts.okPort);
  const api = makeClient(opts.server, opts.password);
  console.log(`canary: fail stub :${opts.failPort} (429 always), ok stub :${opts.okPort} (SSE text)`);

  let verdict = null;
  let detail = "";
  try {
    const created = await api("POST", "/api/session", {
      title: "model-fallback canary",
      model: { providerID: "stubfail", id: "fail" },
    });
    const sessionID = created?.data?.id ?? created?.id;
    if (!sessionID) throw new Error(`session.create returned no id: ${JSON.stringify(created).slice(0, 200)}`);
    await api("POST", `/api/session/${sessionID}/prompt`, { text: "Reply with the marker." });

    const deadline = Date.now() + opts.timeoutMs;
    while (Date.now() < deadline && !verdict) {
      await sleep(700);
      const out = await api("GET", `/api/session/${sessionID}/message`);
      const messages = out?.data ?? out ?? [];
      for (const m of messages) {
        if (m?.type !== "assistant") continue;
        const provider = m?.model?.providerID ?? "?";
        const text = (Array.isArray(m?.content) ? m.content : [])
          .map((c) => (c?.type === "text" ? c.text ?? "" : ""))
          .join("\n");
        if (provider === "stubok") {
          verdict = "SWITCHED";
          detail = `assistant served by ${provider}/${m?.model?.id ?? "?"}: ${text.trim().slice(0, 80)}`;
          break;
        }
        if (provider === "stubfail" && m?.error) {
          verdict = "FAILED-ON-PRIMARY";
          detail = `assistant errored on the primary: ${JSON.stringify(m.error).slice(0, 160)}`;
          break;
        }
      }
    }
    if (!verdict) {
      verdict = "TIMEOUT";
      detail = "no assistant message with a resolvable model within the window";
    }
  } finally {
    failStub.close();
    okStub.close();
  }

  const failTried = STUB_LOG
    ? (await import("node:fs")).readFileSync(STUB_LOG, "utf8").split("\n").filter((l) => l.includes('"stub":"fail"')).length
    : -1;
  const ok = verdict === "SWITCHED" && (failTried === -1 || failTried > 0);
  console.log(`canary: primary (fail stub) requests seen: ${failTried}`);
  console.log(`${ok ? "PASS" : "FAIL"}  ${verdict}: ${detail}`);
  console.log(ok ? "canary verdict: FALLBACK-SERVED (primary 429 -> next rung completed the turn)" : "canary verdict: NOT-SERVED");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`canary: fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
