// Creates the initial Administrator account. 
// Run once per database, from an interactive terminal:
//   docker compose exec user-service npm run admin:create
//   kubectl exec -it deploy/user-service -- npm run admin:create
//   npm run admin:create:dev   (local, without building)
// Safe to re-run: once the system is initialized it changes nothing.
import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { z } from 'zod';
import { prisma } from '../db';
import { registerSchema } from '../api/dto/registerDto';
import { bootstrapAdmin, isInitialized } from '../services/adminService';

// Reads a line without echoing it, so the password never shows on screen.
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();

    let value = '';
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.off('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1); // Backspace
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  // Interactive only: the password must be typed, never passed as an argument
  // or env var (those end up in shell history, process lists and config).
  if (!stdin.isTTY) {
    console.error('This command needs an interactive terminal (e.g. `exec -it`).');
    return 1;
  }

  // Early, friendly check. The authoritative one runs again under the lock.
  if (await isInitialized()) {
    console.log('System already initialized: an initial administrator exists. No changes made.');
    return 0;
  }

  console.log('Create the initial administrator account.\n');
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const email = await rl.question('Email: ');
  const username = await rl.question('Username: ');
  const firstName = await rl.question('First name: ');
  const lastName = await rl.question('Last name: ');
  rl.close();

  const password = await askHidden('Password: ');
  if ((await askHidden('Confirm password: ')) !== password) {
    console.error('Passwords do not match. No changes made.');
    return 1;
  }

  // Same rules as POST /users/register.
  const parsed = registerSchema.safeParse({ email, username, firstName, lastName, password });
  if (!parsed.success) {
    console.error('Invalid input. No changes made.');
    console.error(z.flattenError(parsed.error).fieldErrors);
    return 1;
  }

  const result = await bootstrapAdmin(parsed.data);
  if (!result.ok) {
    const messages = {
      already_initialized: 'System already initialized: an initial administrator exists.',
      email_taken: 'That email is already registered.',
      username_taken: 'That username is already taken.',
    };
    console.error(`${messages[result.reason]} No changes made.`);
    return result.reason === 'already_initialized' ? 0 : 1;
  }

  console.log(`Initial administrator created: ${result.user.username} <${result.user.email}> (id ${result.user.id}).`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error('Failed to create the initial administrator:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
