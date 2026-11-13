/**
 * AI Assistance Disclosure:
 * Tool: Claude (Opus 5.5), date: 2026-11-10
 * Scope: Auto-subscribes a newly registered user's email to the SNS topic with a per-user filter policy
 * Author review: Reviewed and tested locally
 */

import { SNSClient, SubscribeCommand } from "@aws-sdk/client-sns";
import { env } from "../config.ts";
import { snsEnabled } from "./sender.ts";
import { filterPolicyFor } from "./filterPolicy.ts";

let client: SNSClient | null = null;
const sns = (): SNSClient => (client ??= new SNSClient({ region: env.AWS_REGION }));

export async function subscribeUser(userId: string, email: string): Promise<void> {
  if (!snsEnabled()) {
    console.log(`[subscribe:log-only] would subscribe ${email} for user ${userId}`);
    return;
  }
  try {
    await sns().send(
      new SubscribeCommand({
        TopicArn: env.SNS_TOPIC_ARN,
        Protocol: "email",
        Endpoint: email,
        Attributes: {
          FilterPolicyScope: "MessageAttributes",
          FilterPolicy: filterPolicyFor(userId),
        },
      }),
    );
    console.log(`[Notification] Subscribed ${email} for user ${userId} (confirmation email sent)`);
  } catch (err) {
    // Same email already subscribed with a different filter: nothing to retry
    if ((err as Error).message.includes("already exists with different attributes")) {
      console.warn(`[Notification] ${email} is already subscribed with a different filter policy; skipping`);
      return;
    }
    throw err;
  }
}
