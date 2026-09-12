/**
 * Flag record + finding hash (shared spec §2).
 *
 * Finding hash = first 16 hex chars of sha256(file + "\n" + line + "\n" + quote),
 * computed over the BOUNDED quote. Stability contract: same file+line+quote →
 * same hash on every run; any component change → different hash.
 */

import { createHash } from "node:crypto";

/** Verbatim evidence quote bound (shared spec §2): 200 chars, 197 + "…". */
export const QUOTE_MAX = 200;

export type FlagRecord = {
  file: string;
  line: number;
  class: 1 | 2 | 3 | 4 | 5;
  rule: string;
  quote: string;
  action: string;
  hash: string;
};

export function boundQuote(line: string): string {
  const trimmed = line.trim();
  if (trimmed.length <= QUOTE_MAX) return trimmed;
  return trimmed.slice(0, QUOTE_MAX - 1) + "…";
}

export function findingHash(
  file: string,
  line: number,
  quote: string,
): string {
  const digest = createHash("sha256")
    .update(`${file}\n${line}\n${quote}`, "utf8")
    .digest("hex");
  return digest.slice(0, 16);
}

export function makeFlag(
  file: string,
  line: number,
  rule: string,
  ruleClass: 1 | 2 | 3 | 4 | 5,
  rawLine: string,
  action: string,
): FlagRecord {
  const quote = boundQuote(rawLine);
  return {
    file,
    line,
    class: ruleClass,
    rule,
    quote,
    action,
    hash: findingHash(file, line, quote),
  };
}
