// AI assistance: OpenAI Codex, 2026-11-09. Scope: required-suite reports and diagnostic redaction. Review: Reviewed and approved by @ron on 2026-11-09.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
export function verifyReport(xml, boundary) {
  const count = (xml.match(/<testcase(?:\s|>)/g) || []).length;
  if (!xml.trimEnd().endsWith('</testsuites>') || !count || !xml.includes(boundary) || /<(skipped|failure|error)(?:\s|\/|>)/.test(xml)) {
    throw new Error(`Required messaging coverage did not pass completely: ${boundary}`);
  }
  return count;
}

export function redact(text, secrets = []) {
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) text = text.replaceAll(secret, '<REDACTED>');
  return text.replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer <REDACTED>')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<REDACTED>')
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/g, '$1<REDACTED>@');
}

export function sanitizeDirectory(directory, secrets) {
  for (const name of readdirSync(directory).filter(name => /\.(log|xml)$/.test(name))) {
    const file = join(directory, name);
    const safe = redact(readFileSync(file, 'utf8'), secrets);
    writeFileSync(file, name.endsWith('.xml') ? safe.replaceAll('<REDACTED>', '&lt;REDACTED&gt;') : safe);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secrets = JSON.parse(process.env.CI_REDACT_SECRETS_JSON || '[]');
  if (process.argv[2] === 'redact') process.stdout.write(redact(readFileSync(0, 'utf8'), secrets));
  else if (process.argv[2] === 'sanitize') sanitizeDirectory(process.argv[3], secrets);
  else throw new Error('Usage: evidence.mjs redact|sanitize <directory>');
}
