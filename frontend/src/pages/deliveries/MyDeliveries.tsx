// AI-assisted: MyDeliveries page — delivery cards open order details while preserving action buttons.
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
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DeliveryPhotoModal } from "../../components/DeliveryPhotoModal";
import { OrderStatusBadge } from "../../components/StatusPill";
import { ApiError, type OrderResponse, ordersApi, parseUtcDate } from "../../lib/api";

export default function MyDeliveries() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<string | null>("active");

  const [activeItems, setActiveItems] = useState<OrderResponse[]>([]);
  const [completedItems, setCompletedItems] = useState<OrderResponse[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [deliveryOrderId, setDeliveryOrderId] = useState<string | null>(null);

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

  function handleDelivered() {
    window.dispatchEvent(new Event("credits-changed"));
    ordersApi.assignedActive().then(setActiveItems).catch((err) => {
      notifications.show({
        color: "red",
        title: "Failed to refresh deliveries",
        message: err instanceof ApiError ? err.message : "Failed to refresh",
      });
    });
  }

  function renderRow(order: OrderResponse, showActions: boolean) {
    const isLoading = loadingIds.has(order.order_id);

    return (
      <Box
        key={order.order_id}
        p="sm"
        role="link"
        tabIndex={0}
        aria-label={`View details for ${order.name}`}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          navigate(`/orders/${order.order_id}`);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            navigate(`/orders/${order.order_id}`);
          }
        }}
        style={{ border: "1px solid #dee2e6", borderRadius: 8, marginBottom: 8, cursor: "pointer" }}
      >
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Stack gap={4}>
            <Text fw={600}>{order.name}</Text>
            <Group gap="xs" wrap="wrap">
              <OrderStatusBadge status={order.status} />
              <Text size="sm">Reward: {order.reward} cr</Text>
              <Text size="sm" c="dimmed">
                Deadline: {parseUtcDate(order.deadline).toLocaleString()}
              </Text>
              <Text size="sm" c="dimmed">
                {order.pickup_location} → {order.delivery_location}
              </Text>
            </Group>
          </Stack>
          {!showActions && <Text size="sm" c="blue">View details →</Text>}
          {showActions && (
            <Group gap="xs" wrap="nowrap">
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
            </Group>
          )}
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
