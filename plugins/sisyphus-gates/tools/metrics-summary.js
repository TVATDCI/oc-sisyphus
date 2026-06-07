#!/usr/bin/env node
/**
 * tools/metrics-summary.js — print a quick summary of gate metrics.
 *
 * Reads $HOME/.sisyphus/metrics/gate-events.jsonl and prints:
 *   - Total event count
 *   - Breakdown by event_subtype
 *   - Breakdown by tool
 *   - Top 5 reasons
 *   - Last 24h count + most-recent event timestamp
 *   - Path to the metrics file (for jq/grep follow-up)
 *
 * Usage:
 *   npm run metrics:summary
 *   node tools/metrics-summary.js
 */

import { getEvents, getMetricsFilePath } from "../src/metrics.js";

const events = getEvents();

if (events.length === 0) {
  console.log("No metrics recorded yet.");
  console.log(`Metrics file: ${getMetricsFilePath()}`);
  console.log("(Run the plugin to generate events, or trigger blocks via self-test.)");
  process.exit(0);
}

console.log("═══ sisyphus-gates metrics summary ═══\n");
console.log(`Total events: ${events.length}`);
console.log(`File: ${getMetricsFilePath()}\n`);

// Breakdown by event_subtype
const bySubtype = events.reduce((acc, e) => {
  acc[e.event_subtype] = (acc[e.event_subtype] || 0) + 1;
  return acc;
}, {});
console.log("By event_subtype:");
for (const [k, v] of Object.entries(bySubtype).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(15)} ${v}`);
}
console.log("");

// Breakdown by tool
const byTool = events.reduce((acc, e) => {
  acc[e.tool] = (acc[e.tool] || 0) + 1;
  return acc;
}, {});
console.log("By tool:");
for (const [k, v] of Object.entries(byTool).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(10)} ${v}`);
}
console.log("");

// Top 5 reasons
const byReason = events.reduce((acc, e) => {
  // Truncate long reasons for display
  const key = (e.reason || "").slice(0, 80);
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});
const topReasons = Object.entries(byReason).sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log("Top 5 reasons:");
for (const [reason, count] of topReasons) {
  console.log(`  ${count}× ${reason}`);
}
console.log("");

// Last 24h
const cutoff = Date.now() - 24 * 60 * 60 * 1000;
const recent = events.filter((e) => new Date(e.timestamp).getTime() > cutoff);
const last = events[events.length - 1];
console.log(`Last 24h: ${recent.length} events`);
console.log(`Most recent: ${last.timestamp} (${last.event_subtype}, ${last.tool})`);
