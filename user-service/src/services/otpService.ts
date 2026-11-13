/*
Service requirement details 

1. Generate random 6 digit OTP (single use)
2. Send OTP to user email via SMS
3. If a user requests for new otp previous otp becomes invalid
4. Validate OTP
5. If OTP is requested more than three times in 10 minutes throttle request. 'Try again after some time'
6. OTP validation, 3 incorrect OTP per session throttle attempts
7. OTP expiry


HELPER for otp requirements

*/

import {createHash, createHmac, randomInt, randomUUID} from 'crypto'
import fs from 'node:fs';
import {sendEmail} from '../api/middleware/emailServer'
import {redis} from '../redis'
import {env, otpKey} from '../env'
import type { otpRequestInput } from '../api/dto/otpDto'

const OTP_TTL_SECONDS = 120;
const REQUEST_WINDOW_SECONDS = 600;
const MAX_REQUESTS = 3;
const MAX_ATTEMPTS = 3;

function hashEmail(email: string) {
  return createHash('sha256').update(email).digest('hex');
}

// register:{sha256(email)} / reset:{sha256(email)} — one Cluster slot per address.
export function otpKeyPrefix(challengeId: string, email: string) {
  return `${challengeId}:{${hashEmail(email)}}`;
}

function hashOTP(input: otpRequestInput, otp: string): string {
    return createHmac('sha256', otpKey)
      .update(JSON.stringify([input.email, input.challengeId, otp]))
      .digest('hex');
  }


type Result =
  | { ok: true; pending?: string }
  | {
      ok: false;
      reason: 'throttled' | 'locked' | 'missing' | 'challenge' | 'mismatch' | 'invalid';
      retryAfterSeconds?: number;
    };

type OtpUpdateInput = otpRequestInput & { pendingKey?: string };

export async function verifyOTP(
    input: otpRequestInput & { otp: string; pendingKey?: string }
  ): Promise<Result> {
    return updateOTP(
      'verify',
      input,
      hashOTP(input, input.otp.trim())
    );
  }


export async function sendOTPRequest(
  input: otpRequestInput
): Promise<Result> {
  const otp = String(randomInt(100000, 1000000));
  const token = randomUUID();

  const result = await updateOTP(
    'send',
    input,
    hashOTP(input, otp),
    token
  );

  if (!result.ok) return result;

  try {
    await sendEmail({
      to: input.email,
      subject: 'CampusDash OTP Verification',
      text: `Your CampusDash OTP is ${otp}. It expires in 2 minutes.`,
      html: `<p>Your OTP is <strong>${otp}</strong>.</p>
             <p>It expires in 2 minutes.</p>`,
    });
  } catch (error) {
    await updateOTP('cancel', input, '', token)
      .catch(() => undefined);

    throw error;
  }

  return { ok: true };
}

const OTP_SCRIPT = fs.readFileSync(env.REDIS_OTP_LUA, 'utf8');

// All keys use one hash slot, so the script also works with Redis Cluster.
async function updateOTP(
    action: 'send' | 'verify' | 'cancel',
    input: OtpUpdateInput,
    otpHash = '',
    token = '',
  ): Promise<Result> {
    const prefix = otpKeyPrefix(input.challengeId, input.email);
    const keys = [`${prefix}:record`, `${prefix}:requests`, `${prefix}:attempts`];
    if (input.pendingKey) keys.push(input.pendingKey);
    const result = await redis.eval(OTP_SCRIPT, {
      keys,
      arguments: [
        action, input.challengeId, otpHash, token,
        String(OTP_TTL_SECONDS), String(REQUEST_WINDOW_SECONDS),
        String(MAX_REQUESTS), String(MAX_ATTEMPTS),
      ],
    });
    return JSON.parse(String(result)) as Result;
  }
  