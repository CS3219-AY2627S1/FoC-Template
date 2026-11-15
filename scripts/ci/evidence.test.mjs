// AI assistance: OpenAI Codex, 2026-11-09. Scope: required-suite execution safeguards. Review: Reviewed and approved by @ron on 2026-11-09.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyReport, redact, sanitizeDirectory } from './evidence.mjs';

test('required reports must contain executed cases and the named messaging boundary', () => {
  assert.equal(verifyReport('<testsuites><testcase name="Kafka integration works"/></testsuites>', 'Kafka integration'), 1);
  for (const xml of ['', '<testsuites></testsuites>', '<testsuites><testcase name="unrelated"/></testsuites>']) {
    assert.throws(() => verifyReport(xml, 'Kafka integration'));
  }
});

test('diagnostic files are sanitized before cleanup and JUnit placeholders remain XML-safe', () => {
  const dir = mkdtempSync(join(tmpdir(), 'foc-ci-redaction-'));
  try {
    writeFileSync(join(dir, 'service.log'), 'postgres://user:password@db/test Bearer eyJ.abc.def');
    writeFileSync(join(dir, 'tests.xml'), '<testsuites><testcase name="secret"/></testsuites>');
    sanitizeDirectory(dir, ['secret']);
    assert.equal(readFileSync(join(dir, 'service.log'), 'utf8'), 'postgres://user:<REDACTED>@db/test Bearer <REDACTED>');
    assert.equal(readFileSync(join(dir, 'tests.xml'), 'utf8'), '<testsuites><testcase name="&lt;REDACTED&gt;"/></testsuites>');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('skipped, failed, and truncated reports cannot satisfy a required messaging check', () => {
  for (const body of ['<skipped/>', '<failure/>', '<error/>']) {
    assert.throws(() => verifyReport(`<testsuites><testcase name="Kafka integration">${body}</testcase></testsuites>`, 'Kafka integration'));
  }
  assert.throws(() => verifyReport('<testsuites><testcase name="Kafka integration"/>', 'Kafka integration'));
});

test('captured diagnostics remove known credentials and bearer tokens', () => {
  assert.equal(redact('password=secret Bearer eyJ.abc.def', ['secret']), 'password=<REDACTED> Bearer <REDACTED>');
});
