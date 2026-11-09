// AI-assisted: OrderDetail page — view all fields for a single order with role-based actions.
// UI tweaks (Claude Opus 5.5): supplier and people shown by name, readable status
// timeline, Cancel removes an order nobody accepted yet. Reviewed by authors.
// Proof of delivery (from PR #38, Codex): the courier adds a photo when marking the
// order delivered, and the photo shows here with a full-size view. Participant and
// supplier names come with the order from order-service.
import {
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Textarea,
  Title,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DeliveryPhotoModal } from "../../components/DeliveryPhotoModal";
import { OrderChatButton } from "../../components/chat/OrderChatButton";
import { useAuth } from "../../lib/auth";
import {
  ApiError,
  type OrderDetailResponse,
  type OrderStatus,
  ordersApi,
  parseUtcDate,
} from "../../lib/api";
import { ORDER_STATUS_INFO } from "../../lib/orderStatus";
import { useSuppliers } from "../../lib/people";

const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 15000;

async function pollUntil<T>(
  fn: () => Promise<T>,
  done: (r: T) => boolean,
): Promise<T | "timeout"> {
  const deadline = Date.now() + POLL_TIMEOUT;
  while (Date.now() < deadline) {
    const r = await fn();
    if (done(r)) return r;
    await new Promise((res) => setTimeout(res, POLL_INTERVAL));
  }
  return "timeout";
}

const TIMELINE_STATUSES: OrderStatus[] = [
  "OPEN",
  "ACCEPTED",
  "PICKED_UP",
  "AWAITING_APPROVAL",
  "COMPLETED",
];

function StatusTimeline({ status }: { status: OrderStatus }) {
  const isTerminal = status === "CANCELLED" || status === "EXPIRED";
  const steps = isTerminal
    ? (TIMELINE_STATUSES.slice(0, -1) as OrderStatus[]).concat([status])
    : TIMELINE_STATUSES;

  return (
    <Group gap="xs" wrap="wrap" align="center">
      {steps.map((s, i) => {
        const isCurrent = s === status;
        const isPast =
          !isTerminal && TIMELINE_STATUSES.indexOf(s) < TIMELINE_STATUSES.indexOf(status);
        return (
          <Group key={s} gap={4} wrap="nowrap" align="center">
            <Tooltip label={ORDER_STATUS_INFO[s].hint} withArrow openDelay={300}>
            <Badge
              variant={isCurrent ? "filled" : isPast ? "light" : "outline"}
              color={
                isCurrent
                  ? s === "CANCELLED" || s === "EXPIRED"
                    ? "red"
                    : s === "COMPLETED"
                    ? "green"
                    : "blue"
                  : "gray"
              }
              size="sm"
              tt="none"
            >
              {ORDER_STATUS_INFO[s].label}
            </Badge>
            </Tooltip>
            {i < steps.length - 1 && (
              <Text size="xs" c="dimmed">
                →
              </Text>
            )}
          </Group>
        );
      })}
    </Group>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Group gap="sm" align="flex-start" wrap="nowrap">
      <Text size="sm" fw={600} style={{ minWidth: 140 }}>
        {label}
      </Text>
      <Box style={{ fontSize: "var(--mantine-font-size-sm)" }}>{value}</Box>
    </Group>
  );
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const supplier = useSuppliers([order?.supplier_id])[order?.supplier_id ?? ""];

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    ordersApi
      .get(id)
      .then((res) => {
        if (!cancelled) setOrder(res);
      })
      .catch((err) => {
        if (!cancelled)
          notifications.show({
            color: "red",
            title: "Failed to load order",
            message: err instanceof ApiError ? err.message : "Failed to load",
          });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function refreshOrder() {
    if (!id) return;
    try {
      const updated = await ordersApi.get(id);
      setOrder(updated);
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Failed to refresh",
        message: err instanceof ApiError ? err.message : "Failed to refresh",
      });
    }
  }

  async function handleAccept() {
    if (!id) return;
    setActionLoading(true);
    try {
      await ordersApi.accept(id);
      window.dispatchEvent(new Event("credits-changed"));
      notifications.show({
        color: "green",
        title: "Accepted",
        message: "You're the courier for this errand",
      });
      await refreshOrder();
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Accept failed",
        message: err instanceof ApiError ? err.message : "Failed to accept",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleWithdraw() {
    if (!id) return;
    setActionLoading(true);
    try {
      await ordersApi.withdraw(id);
      await refreshOrder();
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Withdraw failed",
        message: err instanceof ApiError ? err.message : "Failed to withdraw",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePickup() {
    if (!id) return;
    setActionLoading(true);
    try {
      await ordersApi.pickup(id);
      await refreshOrder();
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Pick up failed",
        message: err instanceof ApiError ? err.message : "Failed to pick up",
      });
    } finally {
      setActionLoading(false);
    }
  }


  function openCancelModal() {
    setCancelReason("");
    setCancelModalOpen(true);
  }

  /** Nobody accepted the order yet, so order-service only allows deleting it. */
  async function handleRemove() {
    if (!id) return;
    setActionLoading(true);
    setCancelModalOpen(false);
    try {
      const task = await ordersApi.delete(id);
      const result = await pollUntil(
        () => ordersApi.pollDeletion(task.task_id),
        (r) => r.status !== "pending",
      );
      if (result === "timeout") {
        notifications.show({ color: "yellow", title: "Cancel", message: "Still processing" });
      } else if (result.status === "completed") {
        window.dispatchEvent(new Event("credits-changed"));
        notifications.show({
          color: "green",
          title: "Cancelled",
          message: "Request cancelled and removed",
        });
        navigate("/orders/mine", { replace: true });
        return;
      } else {
        notifications.show({
          color: "red",
          title: "Cancel failed",
          message: result.failure_reason ?? "Unknown error",
        });
      }
      await refreshOrder();
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Cancel failed",
        message: err instanceof ApiError ? err.message : "Failed to cancel",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    if (order?.status === "OPEN" && order.courier_id === null) {
      await handleRemove();
      return;
    }
    setActionLoading(true);
    setCancelModalOpen(false);
    try {
      await ordersApi.cancel(id, { reason: cancelReason });
      const result = await pollUntil(
        () => ordersApi.get(id),
        (r) => r.status === "CANCELLED",
      );
      if (result === "timeout") {
        notifications.show({
          color: "yellow",
          title: "Cancel",
          message: "Still processing",
        });
      } else {
        window.dispatchEvent(new Event("credits-changed"));
        notifications.show({
          color: "green",
          title: "Cancelled",
          message: "Order cancelled",
        });
      }
      await refreshOrder();
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Cancel failed",
        message: err instanceof ApiError ? err.message : "Failed to cancel",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApprove() {
    if (!id) return;
    setActionLoading(true);
    try {
      await ordersApi.approve(id);
      const result = await pollUntil(
        () => ordersApi.get(id),
        (r) => r.status === "COMPLETED",
      );
      if (result === "timeout") {
        notifications.show({
          color: "yellow",
          title: "Approve",
          message: "Still processing",
        });
      } else {
        window.dispatchEvent(new Event("credits-changed"));
        notifications.show({
          color: "green",
          title: "Approved",
          message: "Order completed",
        });
      }
      await refreshOrder();
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Approve failed",
        message: err instanceof ApiError ? err.message : "Failed to approve",
      });
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <Box style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
        <Loader />
      </Box>
    );
  }

  if (!order) {
    return <Text c="dimmed">Order not found.</Text>;
  }

  const userId = user?.id ?? "";
  const isRequester = userId === order.requester_id;
  const isCourier = userId === order.courier_id;
  const isNeither = !isRequester && !isCourier;
  const notAccepted = order.status === "OPEN" && order.courier_id === null;
  const hours =
    supplier?.startingTime && supplier.closingTime
      ? `${supplier.startingTime} – ${supplier.closingTime}`
      : null;

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>{order.name}</Title>
        <Text size="xs" c="dimmed">
          Order {order.order_id}
        </Text>
      </div>

      <Box p="md" style={{ border: "1px solid #dee2e6", borderRadius: 8 }}>
        <Stack gap="xs">
          <DetailRow label="Details" value={order.details} />
          <DetailRow label="Reward" value={`${order.reward} credits`} />
          <DetailRow label="Deadline" value={parseUtcDate(order.deadline).toLocaleString()} />
          <DetailRow label="Pickup" value={order.pickup_location} />
          <DetailRow label="Delivery" value={order.delivery_location} />
          <DetailRow
            label="Supplier"
            value={
              supplier ? (
                <Stack gap={2}>
                  <Anchor component={Link} to={`/suppliers/${supplier.id}`} size="sm">
                    {supplier.name}
                  </Anchor>
                  <Text size="xs" c="dimmed">
                    {supplier.building}
                    {supplier.floor ? `, ${supplier.floor}` : ""}
                    {supplier.locationDescription ? ` · ${supplier.locationDescription}` : ""}
                  </Text>
                  {hours && (
                    <Text size="xs" c="dimmed">
                      Open {hours}
                    </Text>
                  )}
                </Stack>
              ) : (
                // Still loading, or supplier-service did not answer: use the name
                // order-service sent with the order.
                order.supplier_name ?? (supplier === null ? "Supplier unavailable" : "Loading…")
              )
            }
          />
          <DetailRow
            label="Requester"
            value={isRequester ? "You" : (order.requester_name ?? "Requester")}
          />
          <DetailRow
            label="Courier"
            value={
              !order.courier_id
                ? "Not assigned yet"
                : isCourier
                  ? "You"
                  : (order.courier_name ?? "Courier")
            }
          />
          <DetailRow label="Created" value={parseUtcDate(order.created_at).toLocaleString()} />
        </Stack>
      </Box>

      <Box>
        <Text fw={600} mb="xs">
          Status
        </Text>
        <StatusTimeline status={order.status} />
      </Box>

      {order.proof_of_delivery_photo && (
        <Box
          component="section"
          aria-labelledby="proof-heading"
          p="md"
          style={{ border: "1px solid #dee2e6", borderRadius: 8 }}
        >
          <Group justify="space-between" mb="xs">
            <Text fw={600} id="proof-heading">
              Proof of delivery
            </Text>
            <Button variant="subtle" size="compact-sm" onClick={() => setProofModalOpen(true)}>
              View full photo
            </Button>
          </Group>
          <UnstyledButton
            onClick={() => setProofModalOpen(true)}
            aria-label="Enlarge proof of delivery photo"
            style={{ display: "block" }}
          >
            <img
              src={order.proof_of_delivery_photo}
              alt="Proof of delivery"
              style={{
                display: "block",
                maxWidth: "100%",
                maxHeight: 280,
                borderRadius: 8,
                objectFit: "cover",
              }}
            />
          </UnstyledButton>
          <Text size="xs" c="dimmed" mt={6}>
            Delivery photo
            {order.courier_id
              ? ` submitted by ${isCourier ? "you" : (order.courier_name ?? "the courier")}`
              : ""}
          </Text>
        </Box>
      )}

      <Group gap="xs">
        {(isRequester || isCourier) && (
          <OrderChatButton
            orderId={order.order_id}
            size="sm"
            label={isRequester ? "Chat with courier" : "Chat with requester"}
          />
        )}

        {actionLoading && <Loader size="sm" />}

        {!actionLoading && isNeither && order.status === "OPEN" && (
          <Button onClick={handleAccept}>Accept</Button>
        )}

        {!actionLoading && isRequester && (notAccepted || order.status === "ACCEPTED") && (
          <Button color="red" variant="outline" onClick={openCancelModal}>
            Cancel
          </Button>
        )}

        {!actionLoading && isRequester && order.status === "AWAITING_APPROVAL" && (
          <Button color="green" onClick={handleApprove}>
            Approve
          </Button>
        )}

        {!actionLoading && isCourier && order.status === "ACCEPTED" && (
          <>
            <Button onClick={handlePickup}>Pick up</Button>
            <Button color="red" variant="outline" onClick={handleWithdraw}>
              Withdraw
            </Button>
          </>
        )}

        {!actionLoading && isCourier && order.status === "PICKED_UP" && (
          <Button color="green" onClick={() => setDeliveryModalOpen(true)}>
            Mark delivered
          </Button>
        )}
      </Group>

      <Modal
        opened={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel request"
      >
        {notAccepted ? (
          <form onSubmit={handleCancel}>
            <Stack gap="md">
              <Text size="sm">
                Nobody has accepted this errand yet, so it will be removed and
                your reserved credits returned.
              </Text>
              <Group justify="flex-end">
                <Button variant="subtle" onClick={() => setCancelModalOpen(false)}>
                  Keep it
                </Button>
                <Button type="submit" color="red">
                  Cancel request
                </Button>
              </Group>
            </Stack>
          </form>
        ) : (
          <form onSubmit={handleCancel}>
            <Stack gap="md">
              <Text size="sm">
                A courier has already accepted this errand. Let them know why you
                are cancelling.
              </Text>
              <Textarea
                label="Reason"
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.currentTarget.value)}
              />
              <Button type="submit" color="red" disabled={!cancelReason.trim()}>
                Confirm Cancel
              </Button>
            </Stack>
          </form>
        )}
      </Modal>

      <Modal
        opened={proofModalOpen}
        onClose={() => setProofModalOpen(false)}
        title="Proof of delivery"
        size="xl"
        centered
      >
        <img
          src={order.proof_of_delivery_photo ?? undefined}
          alt="Full-size proof of delivery"
          style={{ display: "block", width: "100%", height: "auto", borderRadius: 8 }}
        />
      </Modal>

      <DeliveryPhotoModal
        orderId={deliveryModalOpen ? order.order_id : null}
        onClose={() => setDeliveryModalOpen(false)}
        onDelivered={() => {
          window.dispatchEvent(new Event("credits-changed"));
          void refreshOrder();
        }}
      />
    </Stack>
  );
}
