// Portable deployment utilities: Node is already a deployment prerequisite.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
const [command, ...args] = process.argv.slice(2);
const digest = value => createHash('sha256').update(value).digest('hex');
const input = () => readFileSync(0, 'utf8');
if (command === 'hash') {
  const file = args[0];
  process.stdout.write(`${digest(file ? readFileSync(file) : readFileSync(0))}  ${file ?? '-'}\n`);
} else if (command === 'tree-hash') {
  const walk = path => statSync(path).isDirectory()
    ? readdirSync(path).flatMap(name => walk(`${path}/${name}`)) : [path];
  const files = args.flatMap(walk).sort();
  process.stdout.write(digest(files.map(file => `${digest(readFileSync(file))}  ${file}\n`).join('')));
} else if (command === 'decode') {
  process.stdout.write(Buffer.from(input().trim(), 'base64').toString('utf8'));
} else if (command === 'latest-version') {
  const versions = input().trim().split(/\s+/).filter(v => /^\d+\.\d+$/.test(v));
  versions.sort((a, b) => {
    const [am, an] = a.split('.').map(Number), [bm, bn] = b.split('.').map(Number);
    return am - bm || an - bn;
  });
  process.stdout.write(versions.at(-1) ?? '');
} else if (command === 'config') {
  const config = JSON.parse(input());
  const positive = ['USER_API_TIMEOUT', 'SUPPLIER_SERVICE_TIMEOUT_MS', 'ERRAND_SERVICE_TIMEOUT_MS', 'KAFKA_PARTITION_COUNT'];
  for (const key of [...positive, 'SUPPLIER_TIMEZONE']) {
    if (process.env[key] === undefined) continue;
    const value = process.env[key];
    if (positive.includes(key) && !/^[1-9]\d*$/.test(value)) throw new Error(`Invalid positive integer: ${key}`);
    if (key === 'SUPPLIER_TIMEZONE') new Intl.DateTimeFormat('en', { timeZone: value });
    config.data[key] = value;
  }
  process.stdout.write(JSON.stringify(config));
} else {
  throw new Error('Unknown deployment utility');
}
