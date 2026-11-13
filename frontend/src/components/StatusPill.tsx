// AI-assisted: small status badge used across tables and order views.
import { Badge, Tooltip } from "@mantine/core";
import { OrderStatus } from "../lib/api";
import { ORDER_STATUS_INFO } from "../lib/orderStatus";

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge color={active ? "green" : "gray"} variant="light">
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}

export function AccountStatusBadge({ suspended }: { suspended: boolean }) {
  return (
    <Badge color={suspended ? "red" : "green"} variant="light">
      {suspended ? "Suspended" : "Active"}
    </Badge>
  );
}

const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  OPEN: "blue",
  ACCEPTED: "cyan",
  PICKED_UP: "yellow",
  AWAITING_APPROVAL: "orange",
  COMPLETED: "green",
  CANCELLED: "red",
  EXPIRED: "gray",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const info = ORDER_STATUS_INFO[status];
  return (
    <Tooltip label={info?.hint ?? status} withArrow openDelay={300}>
      <Badge color={ORDER_STATUS_COLORS[status]} variant="light" tt="none">
        {info?.label ?? status}
      </Badge>
    </Tooltip>
  );
}
