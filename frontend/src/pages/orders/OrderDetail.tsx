// AI-assisted: Responsive order detail layout, delivery progress, participant names, and proof viewer.
// Merged with PR #35 (Claude Opus 5.5): readable status labels shared with the rest of
// the app, supplier location and hours, order chat, Cancel removing an order nobody
// accepted yet, and open errands viewable before accepting. Reviewed by authors.
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  CopyButton,
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
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconCalendarDue,
  IconCamera,
  IconCheck,
  IconClock,
  IconCoins,
  IconCopy,
  IconMapPin,
  IconMaximize,
  IconNotes,
  IconPackage,
  IconTruckDelivery,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { DeliveryPhotoModal } from "../../components/DeliveryPhotoModal";
import { OrderChatButton } from "../../components/chat/OrderChatButton";
import { ApiError, type OrderDetailResponse, type OrderStatus, ordersApi, parseUtcDate } from "../../lib/api";
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

// Same labels as the status badges on the list pages.
const STATUS_LABELS = Object.fromEntries(
  Object.entries(ORDER_STATUS_INFO).map(([status, info]) => [status, info.label]),
) as Record<OrderStatus, string>;

// Worded for whoever is reading: requester, courier, or someone about to accept.
const STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  OPEN: "Waiting for a courier to accept this errand.",
  ACCEPTED: "The courier is on the way to pick up the order.",
  PICKED_UP: "The courier has the items and is on the way to the delivery location.",
  AWAITING_APPROVAL: "Delivered. Waiting for the requester to confirm.",
  COMPLETED: "Delivery approved. This order is complete.",
  CANCELLED: "This order has been cancelled.",
  EXPIRED: "This order expired before it was accepted.",
};

function formatDate(value: string) {
  return parseUtcDate(value).toLocaleDateString("en-SG", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatTime(value: string) {
  return parseUtcDate(value).toLocaleTimeString("en-SG", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function StatusTimeline({ status }: { status: OrderStatus }) {
  const isTerminal = status === "CANCELLED" || status === "EXPIRED";
  const currentIndex = TIMELINE_STATUSES.indexOf(status);
  if (isTerminal) {
    return (
      <div className="order-terminal-status">
        <span className="order-progress-dot" data-state="terminal">
          <IconX size={15} aria-hidden="true" />
        </span>
        <span>{STATUS_LABELS[status]}</span>
      </div>
    );
  }
  return (
    <ol className="order-progress" aria-label="Order progress">
      {TIMELINE_STATUSES.map((step, index) => {
        const isCurrent = step === status;
        const isDone = index < currentIndex || status === "COMPLETED";
        return (
          <li key={step} data-state={isDone ? "done" : isCurrent ? "current" : "upcoming"}
            aria-current={isCurrent ? "step" : undefined}>
            <span className="order-progress-dot" aria-hidden="true">
              {isDone ? <IconCheck size={14} stroke={2.5} /> : <span />}
            </span>
            <span>{STATUS_LABELS[step]}</span>
            {isCurrent && <span className="order-progress-current">{status === "COMPLETED" ? "Done" : "Now"}</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Participant({ label, name, isYou }: { label: string; name: string; isYou: boolean }) {
  return (
    <div className="order-person">
      <Avatar color={label === "Requester" ? "brand" : "teal"} radius="xl" size={40}>
        <IconUser size={20} aria-hidden="true" />
      </Avatar>
      <div className="order-person-info">
        <span className="order-field-label">{label}</span>
        <span className="order-person-name">{name} {isYou && <span className="order-you-tag">You</span>}</span>
      </div>
    </div>
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
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
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
  const hasActions = (isNeither && order.status === "OPEN")
    || (isRequester && ["OPEN", "ACCEPTED", "AWAITING_APPROVAL"].includes(order.status))
    || (isCourier && ["ACCEPTED", "PICKED_UP"].includes(order.status));
  const notAccepted = order.status === "OPEN" && order.courier_id === null;
  // Never show raw ids: fall back to the role when a name lookup failed.
  const supplierName = supplier?.name ?? order.supplier_name ?? "Supplier";
  const requesterName = order.requester_name ?? "Requester";
  const courierName = order.courier_id ? (order.courier_name ?? "Courier") : "Not assigned yet";
  const supplierWhere = supplier
    ? [
        [supplier.building, supplier.floor].filter(Boolean).join(", "),
        supplier.locationDescription,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const supplierHours =
    supplier?.startingTime && supplier.closingTime
      ? `${supplier.startingTime} – ${supplier.closingTime}`
      : null;
  const back = isCourier
    ? { to: "/deliveries", label: "My deliveries" }
    : isRequester
      ? { to: "/orders/mine", label: "My requests" }
      : { to: "/errands", label: "Take Errands" };
  const statusColor = order.status === "COMPLETED" ? "teal"
    : order.status === "CANCELLED" ? "red" : order.status === "EXPIRED" ? "gray" : "brand";

  return (
    <div className="order-detail">
      <nav className="order-breadcrumb" aria-label="Breadcrumb">
        <Link to={back.to}>
          <IconArrowLeft size={15} aria-hidden="true" />
          {back.label}
        </Link>
        <span aria-hidden="true">/</span>
        <span>Order details</span>
      </nav>

      <header className="order-detail-header">
        <div>
          <div className="order-eyebrow">ORDER DETAILS</div>
          <Title order={1} className="order-detail-title">{order.name}</Title>
          <p className="order-detail-description">{STATUS_DESCRIPTIONS[order.status]}</p>
        </div>
        <Badge className="order-header-status" color={statusColor} variant="light" size="lg" radius="xl"
          leftSection={order.status === "COMPLETED" ? <IconCheck size={14} /> : undefined}>
          {STATUS_LABELS[order.status]}
        </Badge>
      </header>

      <div className="order-detail-grid">
        <div className="order-detail-main">
          <section className="order-panel" aria-labelledby="delivery-heading">
            <div className="order-panel-heading">
              <span className="order-section-icon"><IconTruckDelivery size={20} aria-hidden="true" /></span>
              <Title order={2} id="delivery-heading">Delivery details</Title>
            </div>
            <div className="order-route">
              <div className="order-route-stop">
                <span className="order-route-marker" data-stop="pickup"><IconPackage size={18} aria-hidden="true" /></span>
                <div className="order-route-info">
                  <span className="order-field-label">Pickup location</span>
                  <p className="order-location">{order.pickup_location}</p>
                  <Link className="order-supplier-link" to={`/suppliers/${encodeURIComponent(order.supplier_id)}`}>
                    {supplierName}<IconArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                  {supplierWhere && (
                    <Text size="xs" c="dimmed" mt={4}>
                      {supplierWhere}
                    </Text>
                  )}
                  {supplierHours && (
                    <Text size="xs" c="dimmed">
                      Open {supplierHours}
                    </Text>
                  )}
                </div>
              </div>
              <div className="order-route-stop">
                <span className="order-route-marker" data-stop="delivery"><IconMapPin size={18} aria-hidden="true" /></span>
                <div className="order-route-info">
                  <span className="order-field-label">Delivery location</span>
                  <p className="order-location">{order.delivery_location}</p>
                </div>
              </div>
            </div>
            <div className="order-notes">
              <div className="order-notes-heading"><IconNotes size={16} aria-hidden="true" />Request notes</div>
              <p>{order.details}</p>
            </div>
          </section>

          {order.proof_of_delivery_photo && (
            <section className="order-panel order-proof-panel" aria-labelledby="proof-heading">
              <div className="order-panel-heading order-proof-heading">
                <div className="order-heading-with-icon">
                  <span className="order-section-icon"><IconCamera size={20} aria-hidden="true" /></span>
                  <Title order={2} id="proof-heading">Proof of delivery</Title>
                </div>
                <Button className="order-proof-view-button" variant="subtle" size="compact-sm" color="brand"
                  aria-label="View full photo" title="View full photo"
                  rightSection={<IconMaximize size={15} aria-hidden="true" />}
                  onClick={() => setProofModalOpen(true)}><span className="order-proof-view-label">View full photo</span></Button>
              </div>
              <UnstyledButton className="order-proof-image-button" onClick={() => setProofModalOpen(true)}
                aria-label="Enlarge proof of delivery photo">
                <img src={order.proof_of_delivery_photo} alt="Proof of delivery" className="order-proof-image" />
                <span className="order-proof-expand"><IconMaximize size={18} aria-hidden="true" /></span>
              </UnstyledButton>
              <div className="order-proof-caption"><IconCamera size={14} aria-hidden="true" />
                Delivery photo{order.courier_id ? <> submitted by <strong>{courierName}</strong></> : null}
              </div>
            </section>
          )}
        </div>

        <aside className="order-detail-sidebar" aria-label="Order summary and progress">
          <section className="order-panel" aria-labelledby="summary-heading">
            <Title order={2} id="summary-heading" className="order-sidebar-title">Order summary</Title>
            <div className="order-reward">
              <div className="order-reward-label"><IconCoins size={17} aria-hidden="true" />Courier reward</div>
              <div className="order-reward-amount">{order.reward}<span>{order.reward === 1 ? "credit" : "credits"}</span></div>
            </div>
            <div className="order-summary-row">
              <IconCalendarDue size={19} aria-hidden="true" />
              <div><span className="order-field-label">Delivery deadline</span>
                <time dateTime={order.deadline}>{formatDate(order.deadline)}<span className="order-summary-time">{formatTime(order.deadline)}</span></time>
              </div>
            </div>
            <div className="order-summary-row">
              <IconClock size={19} aria-hidden="true" />
              <div><span className="order-field-label">Order placed</span>
                <time dateTime={order.created_at}>{formatDate(order.created_at)}<span className="order-summary-time">{formatTime(order.created_at)}</span></time>
              </div>
            </div>
            {(hasActions || actionLoading) && <div className="order-detail-actions">
              {actionLoading && <Loader size="sm" />}

              {!actionLoading && isNeither && order.status === "OPEN" && (
                <Button onClick={handleAccept}>Accept</Button>
              )}

              {!actionLoading && isRequester && (notAccepted || order.status === "ACCEPTED") && (
                <Button color="orange" variant="outline" onClick={openCancelModal}>
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
            </div>}
          </section>

          <section className="order-panel" aria-labelledby="people-heading">
            <Title order={2} id="people-heading" className="order-sidebar-title">People</Title>
            <div className="order-people">
              <Participant label="Requester" name={requesterName} isYou={isRequester} />
              <Participant label="Courier" name={courierName} isYou={isCourier} />
            </div>
            {(isRequester || isCourier) && (
              <Box mt="md">
                <OrderChatButton
                  orderId={order.order_id}
                  size="sm"
                  label={isRequester ? "Chat with courier" : "Chat with requester"}
                />
              </Box>
            )}
          </section>

          <section className="order-panel" aria-labelledby="progress-heading">
            <Title order={2} id="progress-heading" className="order-sidebar-title">Order progress</Title>
            <StatusTimeline status={order.status} />
          </section>
        </aside>
      </div>

      <footer className="order-reference">
        <span>Order ID</span><code>{order.order_id}</code>
        <CopyButton value={order.order_id}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? "Copied" : "Copy order ID"} withArrow>
              <ActionIcon aria-label="Copy order ID" onClick={copy} variant="subtle" color={copied ? "teal" : "gray"} size="sm">
                {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </footer>

      <Modal opened={proofModalOpen} onClose={() => setProofModalOpen(false)} title="Proof of delivery" size="xl" centered>
        <img src={order.proof_of_delivery_photo ?? undefined} alt="Full-size proof of delivery" className="order-proof-full-image" />
      </Modal>

      <DeliveryPhotoModal
        orderId={deliveryModalOpen ? id ?? null : null}
        onClose={() => setDeliveryModalOpen(false)}
        onDelivered={() => {
          window.dispatchEvent(new Event("credits-changed"));
          void refreshOrder();
        }}
      />

      <Modal
        opened={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel request"
      >
        <form onSubmit={handleCancel}>
          {notAccepted ? (
            <Stack gap="md">
              <Text size="sm">
                Nobody has accepted this errand yet, so it will be removed and your
                reserved credits returned.
              </Text>
              <Button type="submit" color="red">
                Cancel request
              </Button>
            </Stack>
          ) : (
            <Stack gap="md">
              <Text size="sm">
                A courier has already accepted this errand. Let them know why you are
                cancelling.
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
          )}
        </form>
      </Modal>
    </div>
  );
}
