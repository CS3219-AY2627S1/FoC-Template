import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { env } from "../config.ts";
import type { Notification } from "./templates.ts";

let client: SNSClient | null = null;
const sns = (): SNSClient => (client ??= new SNSClient({ region: env.AWS_REGION }));

export const snsEnabled = (): boolean => Boolean(env.SNS_TOPIC_ARN);

export async function send(n: Notification): Promise<void> {
  const subject = `[FoC] ${n.subject}`.slice(0, 100); // SNS email subject limit

  if (!snsEnabled()) {
    console.log(`[email:log-only] to user ${n.userId} | ${subject}\n${n.body}`);
    return;
  }

  await sns().send(
    new PublishCommand({
      TopicArn: env.SNS_TOPIC_ARN,
      Subject: subject,
      Message: n.body,
      MessageAttributes: { userId: { DataType: "String", StringValue: n.userId } },
    }),
  );
}
