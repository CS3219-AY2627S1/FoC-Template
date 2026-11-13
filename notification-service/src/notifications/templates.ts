import type { OrderEvent } from "../events/orderEvent.ts";

export interface Notification {
  userId: string;
  subject: string;
  body: string;
}

export function buildNotifications(event: OrderEvent, appUrl = ""): Notification[] {
  const { order_id, requester_id, courier_id, credit_amount: c, title } = event.data;
  const t = title ? `"${title}"` : "your errand";
  const footer = `\n\nOrder ID: ${order_id}` + (appUrl ? `\nOpen FoC: ${appUrl}` : "");

  const to = (userId: string | null, subject: string, body: string): Notification[] =>
    userId ? [{ userId, subject, body: body + footer }] : [];
  const requester = (subject: string, body: string) => to(requester_id, subject, body);
  const courier = (subject: string, body: string) => to(courier_id, subject, body);

  switch (event.event_type) {
    case "ORDER_CREATED":
      return requester(
        "Your errand is posted",
        `Your errand ${t} is now open for couriers. ${c} credit(s) have been reserved from your balance.`,
      );
    case "ORDER_ACCEPTED":
      return [
        ...requester("A courier accepted your errand", `Good news! A courier has accepted your errand ${t}.`),
        ...courier(
          "You accepted an errand",
          `You accepted the errand ${t}. Head to the pickup location to collect the items.`,
        ),
      ];
    case "ORDER_PICKED_UP":
      return requester(
        "Your items have been picked up",
        `The courier has collected the items for ${t} and is on the way.`,
      );
    case "ORDER_COMPLETED":
      return [
        ...requester(
          "Errand completed",
          `You confirmed delivery of ${t}. ${c} credit(s) are being transferred to your courier.`,
        ),
        ...courier(
          "You earned credits",
          `The requester confirmed delivery of ${t}. ${c} credit(s) are being transferred to you.`,
        ),
      ];
    case "ORDER_CANCELLED":
      // No title = compensation event: the order was never saved
      if (!title) {
        return requester(
          "Your errand could not be created",
          `Something went wrong while creating your errand. The ${c} reserved credit(s) are being released back to you.`,
        );
      }
      return [
        ...requester(
          "Errand cancelled",
          `Your errand ${t} was cancelled. The ${c} reserved credit(s) are being released back to you.`,
        ),
        ...courier(
          "An errand you accepted was cancelled",
          `The requester cancelled ${t}. You no longer need to deliver it.`,
        ),
      ];
    case "ORDER_EXPIRED":
      return requester(
        "Your errand expired",
        `No courier accepted ${t} before its accept-by time, so it has expired. The ${c} reserved credit(s) are being released back to you.`,
      );
    default:
      return [];
  }
}
