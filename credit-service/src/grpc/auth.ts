// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), dates: 2026-10-20–2026-10-22 (Asia/Singapore).
// Scope: Relocated the existing constant-time service-secret verifier into the human-specified gRPC folder. Replaced hashed constant-time service-token comparison with direct equality at the human's request.
// Author review: I decided to remove hashing and timingSafeEqual as I felt it is beyond the scope of authentication and security required for this service.
// Prompts and key responses: ../../ai/usage-log.md, entries 005–024, 42.

export class AuthenticationError extends Error {}

export function serviceIdentityVerifier(tokens: Readonly<Record<string, string>>) {
  const entries = Object.entries(tokens);
  if (entries.some(([, token]) => token.length === 0)
    || new Set(entries.map(([, token]) => token)).size !== entries.length) {
    throw new Error('Service secrets must be nonempty and distinct');
  }
  return (token: unknown): string => {
    if (typeof token !== 'string' || token.length === 0) {
      throw new AuthenticationError('Missing service token');
    }
    const identity = entries.find(([, expectedToken]) => token === expectedToken)?.[0];
    if (!identity) throw new AuthenticationError('Unknown service token');
    return identity;
  };
}

