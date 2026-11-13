// AI-assisted (Claude), reviewed and tested by Maliha
// Content filter for chat messages (F10.5).
// Swearing gets masked and still sent. Threats and telling someone to hurt
// themselves get blocked. Both are flagged for admins.
import {
  RegExpMatcher,
  TextCensor,
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

// obscenity handles leetspeak and spacing tricks like "f u c k" or "sh1t"
const profanity = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});
const censor = new TextCensor().setStrategy(asteriskCensorStrategy());

// Checked against a squashed copy (lowercase, no spaces/punctuation),
// so "k y s" and "kill.your.self" are caught too
const HARMFUL = [
  /\bkys\b/,
  /kill(ur|your)self/,
  /goandie|godie\b/,
  /i('?ll|will)(kill|hurt|stab)(you|u)\b/,
  /iknowwhereyoulive/,
];

const squash = (text: string) => text.toLowerCase().replace(/[^a-z']/g, '');

export type FilterResult =
  | { action: 'ok'; text: string }
  | { action: 'masked'; text: string }
  | { action: 'blocked' };

export function filterMessage(text: string): FilterResult {
  // \bkys\b needs word boundaries, so test it on the plain lowercase text as well
  const lower = text.toLowerCase();
  const squashed = squash(text);
  if (HARMFUL.some((re) => re.test(squashed) || re.test(lower))) {
    return { action: 'blocked' };
  }

  const matches = profanity.getAllMatches(text);
  if (matches.length === 0) return { action: 'ok', text };
  return { action: 'masked', text: censor.applyTo(text, matches) };
}