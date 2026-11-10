// AI-assisted: MyDeliveries page — courier's active and completed deliveries with Pick up/Withdraw/Deliver actions and Google Maps navigation.
// UI tweaks (Claude Opus 5.5): clickable rows with the supplier name. Reviewed by authors.
// Proof of delivery: "Mark delivered" asks for a photo first (DeliveryPhotoModal).
import {
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconRoute } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrderStatusBadge } from "../../components/StatusPill";

import { DeliveryPhotoModal } from "../../components/DeliveryPhotoModal";
import { OrderChatButton } from "../../components/chat/OrderChatButton";
import {
  ApiError,
  type OrderResponse,
  ordersApi,
  parseUtcDate,
  suppliersApi,
} from "../../lib/api";
import { useSuppliers } from "../../lib/people";

/** The row's own buttons should not also open the order. */
function stop(e: React.SyntheticEvent) {
  e.stopPropagation();
}

export default function MyDeliveries() {
  const [activeTab, setActiveTab] = useState<string | null>("active");

  const [activeItems, setActiveItems] = useState<OrderResponse[]>([]);
  const [completedItems, setCompletedItems] = useState<OrderResponse[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [deliveryOrderId, setDeliveryOrderId] = useState<string | null>(null);

  const navigate = useNavigate();
  const shownOrders = [...activeItems, ...completedItems];
  const suppliers = useSuppliers(shownOrders.map((o) => o.supplier_id));

  useEffect(() => {
    let cancelled = false;
    setLoadingActive(true);
    ordersApi
      .assignedActive()
      .then((res) => {
        if (!cancelled) setActiveItems(res);
      })
      .catch((err) => {
        if (!cancelled)
          notifications.show({
            color: "red",
            title: "Failed to load deliveries",
            message: err instanceof ApiError ? err.message : "Failed to load",
          });
      })
      .finally(() => {
        if (!cancelled) setLoadingActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "completed") return;
    let cancelled = false;
    setLoadingCompleted(true);
    ordersApi
      .assignedCompleted()
      .then((res) => {
        if (!cancelled) setCompletedItems(res);
      })
      .catch((err) => {
        if (!cancelled)
          notifications.show({
            color: "red",
            title: "Failed to load deliveries",
            message: err instanceof ApiError ? err.message : "Failed to load",
          });
      })
      .finally(() => {
        if (!cancelled) setLoadingCompleted(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  function addLoading(id: string) {
    setLoadingIds((prev) => new Set(prev).add(id));
  }

  function removeLoading(id: string) {
    setLoadingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handlePickup(id: string) {
    addLoading(id);
    try {
      await ordersApi.pickup(id);
      const updated = await ordersApi.assignedActive();
      setActiveItems(updated);
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Pick up failed",
        message: err instanceof ApiError ? err.message : "Failed to pick up",
      });
    } finally {
      removeLoading(id);
    }
  }

  async function handleWithdraw(id: string) {
    addLoading(id);
    try {
      await ordersApi.withdraw(id);
      const updated = await ordersApi.assignedActive();
      setActiveItems(updated);
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Withdraw failed",
        message: err instanceof ApiError ? err.message : "Failed to withdraw",
      });
    } finally {
      removeLoading(id);
    }
  }

  // DeliveryPhotoModal uploads the photo and marks the order delivered.
  function handleDelivered() {
    window.dispatchEvent(new Event("credits-changed"));
    ordersApi
      .assignedActive()
      .then(setActiveItems)
      .catch((err) => {
        notifications.show({
          color: "red",
          title: "Failed to refresh deliveries",
          message: err instanceof ApiError ? err.message : "Failed to refresh",
        });
      });
  }

  async function handleNavigate(order: OrderResponse) {
    setNavigatingId(order.order_id);
    try {
      let destination: string;

      if (order.status === "PICKED_UP") {
        // Second stage: pick up -> delivery.
        destination =
          order.delivery_latitude != null && order.delivery_longitude != null
            ? `${order.delivery_latitude},${order.delivery_longitude}`
            : order.delivery_location;
      } else {
        // First stage: current location -> supplier (pickup point).
        destination = order.pickup_location;
        try {
          const supplier = await suppliersApi.get(order.supplier_id);
          if (supplier.latitude != null && supplier.longitude != null) {
            destination = `${supplier.latitude},${supplier.longitude}`;
          }
        } catch {
          // Fall back to the pickup address text when the lookup fails.
        }
      }

      const url = new URL("https://www.google.com/maps/dir/");
      url.searchParams.set("api", "1");
      url.searchParams.set("destination", destination);
      url.searchParams.set("travelmode", "walking");
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    } finally {
      setNavigatingId(null);
    }
  }

  function renderRow(order: OrderResponse, showActions: boolean) {
  const isLoading = loadingIds.has(order.order_id);
  const supplier = suppliers[order.supplier_id];
  const open = () => navigate(`/orders/${order.order_id}`);

  return (
    <Box
      key={order.order_id}
      p="sm"
      role="link"
      tabIndex={0}
      aria-label={`Open ${order.name}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) open();
      }}
      style={{
        border: "1px solid #dee2e6",
        borderRadius: 8,
        marginBottom: 8,
        cursor: "pointer",
      }}
      data-testid="order-row"
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={4}>
          <Text fw={600}>{order.name}</Text>

          {supplier && (
            <Text size="xs" c="dimmed">
              {supplier.name}
            </Text>
          )}

          <Group gap="xs" wrap="wrap">
            <OrderStatusBadge status={order.status} />

            <Text size="sm">
              Reward: {order.reward} cr
            </Text>

            <Text size="sm" c="dimmed">
              Deadline: {parseUtcDate(order.deadline).toLocaleString()}
            </Text>

            <Text size="sm" c="dimmed">
              {order.pickup_location} → {order.delivery_location}
            </Text>
          </Group>
        </Stack>

        <Group
          gap="xs"
          wrap="nowrap"
          onClick={stop}
          onKeyDown={stop}
        >
          {!isLoading && (
            <OrderChatButton orderId={order.order_id} />
          )}

          {showActions && (
            <>
              {(order.status === "ACCEPTED" ||
                order.status === "PICKED_UP") && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconRoute size={14} />}
                  loading={navigatingId === order.order_id}
                  onClick={() => handleNavigate(order)}
                >
                  Navigate
                </Button>
              )}

              {isLoading && <Loader size="sm" />}

              {!isLoading && order.status === "ACCEPTED" && (
                <>
                  <Button
                    size="xs"
                    onClick={() => handlePickup(order.order_id)}
                  >
                    Pick up
                  </Button>

                  <Button
                    size="xs"
                    color="red"
                    variant="outline"
                    onClick={() => handleWithdraw(order.order_id)}
                  >
                    Withdraw
                  </Button>
                </>
              )}
              {!isLoading && order.status === "PICKED_UP" && (
                <Button
                  size="xs"
                  color="green"
                  onClick={() => setDeliveryOrderId(order.order_id)}
                >
                  Mark delivered
                </Button>
              )}
            </>
          )}
        </Group>
      </Group>
    </Box>
  );
}

  return (
    <Stack gap="lg">
      <Title order={2}>My Deliveries</Title>
      <DeliveryPhotoModal
        orderId={deliveryOrderId}
        onClose={() => setDeliveryOrderId(null)}
        onDelivered={handleDelivered}
      />

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="active">Active</Tabs.Tab>
          <Tabs.Tab value="completed">Completed</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="active" pt="md">
          {loadingActive ? (
            <Box
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "2rem",
              }}
            >
              <Loader />
            </Box>
          ) : activeItems.length === 0 ? (
            <Text c="dimmed">No active deliveries</Text>
          ) : (
            activeItems.map((o) => renderRow(o, true))
          )}
        </Tabs.Panel>

        <Tabs.Panel value="completed" pt="md">
          {loadingCompleted ? (
            <Box
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "2rem",
              }}
            >
              <Loader />
            </Box>
          ) : completedItems.length === 0 ? (
            <Text c="dimmed">No completed deliveries</Text>
          ) : (
            completedItems.map((o) => renderRow(o, false))
          )}
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
