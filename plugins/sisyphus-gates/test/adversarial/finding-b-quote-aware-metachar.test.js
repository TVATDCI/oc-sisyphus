/**
 * test/adversarial/finding-b-quote-aware-metachar.test.js
 *
 * Finding B (Oracle ses_0656dc708ffeOMNXBtw0kJm9Wh): hasShellMetachar scanned
 * the RAW command string for metacharacters, false-positive-blocking legitimate
 * commands where `;`, `|`, `&&`, `||` appeared inside QUOTED argument values
 * (e.g. `python3 script.py --value "a;b"`).
 *
 * This test verifies the fix: metacharacters inside quotes are literal data,
 * not chain operators. Regression guards confirm unquoted metacharacters and
 * interpreter -c payloads are still caught.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  hasShellMetachar,
  isDestructiveCommand,
} from "../../src/command-policy.js";

describe("Finding B — quoted metacharacters are literal (not chain operators)", () => {
  test('semicolon inside double quotes is NOT a metachar', () => {
    assert.equal(hasShellMetachar('python3 s.py --value "a;b"'), false);
  });

  test('semicolon inside single quotes is NOT a metachar', () => {
    assert.equal(hasShellMetachar("python3 s.py --value 'a;b'"), false);
  });

  test('&& inside double quotes is NOT a metachar', () => {
    assert.equal(hasShellMetachar('echo "a && b"'), false);
  });

  test('|| inside double quotes is NOT a metachar', () => {
    assert.equal(hasShellMetachar('echo "a || b"'), false);
  });

  test('pipe inside double quotes is NOT a metachar', () => {
    assert.equal(hasShellMetachar('echo "a|b"'), false);
  });

  test('quoted-metachar command is NOT destructive', () => {
    assert.equal(isDestructiveCommand('python3 s.py --value "a;b|c && d"'), false);
  });
});

describe("Finding B — regression guards (unquoted metachars still blocked)", () => {
  test('unquoted semicolon IS a metachar', () => {
    assert.equal(hasShellMetachar("git status; rm -rf /"), true);
  });

  test('unquoted && IS a metachar', () => {
    assert.equal(hasShellMetachar("git status && git log"), true);
  });

  test('unquoted || IS a metachar', () => {
    assert.equal(hasShellMetachar("git status || echo fail"), true);
  });

  test('unquoted pipe IS a metachar', () => {
    assert.equal(hasShellMetachar("git status | grep foo"), true);
  });

  test('newline IS a metachar', () => {
    assert.equal(hasShellMetachar("git status\nrm -rf /"), true);
  });

  test('command substitution in double quotes IS a metachar ($() active)', () => {
    assert.equal(hasShellMetachar('echo "$(rm -rf /)"'), true);
  });

  test('backtick in double quotes IS a metachar', () => {
    assert.equal(hasShellMetachar('echo "`rm -rf /`"'), true);
  });

  test('unquoted redirect IS a metachar', () => {
    assert.equal(hasShellMetachar('echo "a" > /tmp/file'), true);
  });

  test('mixed: quoted semicolon + unquoted pipe → still caught', () => {
    assert.equal(hasShellMetachar('echo "a;b" | grep c'), true);
  });
});

describe("Finding B — interpreter -c payloads still blocked (independent check)", () => {
  test('bash -c with destructive payload is destructive', () => {
    assert.equal(isDestructiveCommand('bash -c "rm -rf /"'), true);
  });

  test('python3 -c with semicolon in payload is destructive', () => {
    assert.equal(isDestructiveCommand('python3 -c "import os; os.remove(\'x\')"'), true);
  });

  test('eval with destructive payload is destructive', () => {
    assert.equal(isDestructiveCommand('eval "rm -rf /"'), true);
  });

  test('sh -c with payload is destructive', () => {
    assert.equal(isDestructiveCommand('sh -c "git push --force"'), true);
  });
});

describe("Finding B — backslash escape edge cases (Oracle final-review probe)", () => {
  test('escaped dquote outside quotes: backslash skips ", unquoted ; caught', () => {
    assert.equal(hasShellMetachar('echo \\"; rm x'), true);
  });

  test("backslash literal inside single quotes: ' closes quote, unquoted ; caught", () => {
    assert.equal(hasShellMetachar("echo 'a\\'; rm x"), true);
  });

  test('backslash escape inside double quotes: \\"; is literal data', () => {
    assert.equal(hasShellMetachar('echo "a\\"; b"'), false);
  });
});
