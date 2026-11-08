import {
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  type Notification,
  notificationsApi,
  parseUtcDate,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";

const PAGE_SIZE = 20;

function formatTime(value: string): string {
  return parseUtcDate(value).toLocaleString();
}

export default function Notifications() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();

  const [items, setItems] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (offset: number) => {
      if (!userId) return;
      const first = offset === 0;
      if (first) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const list = await notificationsApi.list(userId, {
          limit: PAGE_SIZE,
          offset,
        });
        setTotal(list.total);
        setUnreadCount(list.unread_count);
        setItems((prev) => (first ? list.items : [...prev, ...list.items]));
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Failed to load notifications",
        );
      } finally {
        if (first) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  async function handleOpen(n: Notification) {
    if (n.read_at === null && userId) {
      setItems((prev) =>
        prev.map((item) =>
          item.notification_id === n.notification_id
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await notificationsApi.markRead(userId, n.notification_id);
      } catch {
        // ignore
      }
      window.dispatchEvent(new Event("notifications-changed"));
    }
    navigate(`/orders/${n.order_id}`);
  }

  async function handleMarkAll() {
    if (!userId) return;
    try {
      await notificationsApi.markAllRead(userId);
    } catch {
      // ignore
    }
    setUnreadCount(0);
    window.dispatchEvent(new Event("notifications-changed"));
    void load(0);
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Notifications</Title>
        <Button
          variant="light"
          onClick={handleMarkAll}
          disabled={unreadCount === 0}
        >
          Mark all as read
        </Button>
      </Group>

      {loading ? (
        <Box
          style={{ display: "flex", justifyContent: "center", padding: "2rem" }}
        >
          <Loader />
        </Box>
      ) : error ? (
        <Text c="red" role="alert">
          {error}
        </Text>
      ) : items.length === 0 ? (
        <Text c="dimmed">No notifications yet</Text>
      ) : (
        <Stack gap="sm">
          {items.map((n) => {
            const unread = n.read_at === null;
            return (
              <Paper
                key={n.notification_id}
                withBorder
                p="md"
                role="button"
                tabIndex={0}
                onClick={() => handleOpen(n)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void handleOpen(n);
                  }
                }}
                style={{
                  cursor: "pointer",
                  backgroundColor: unread
                    ? "var(--mantine-color-blue-light)"
                    : undefined,
                }}
              >
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Stack gap={4}>
                    <Group gap="xs" wrap="nowrap">
                      <Text fw={unread ? 700 : 500}>{n.title}</Text>
                      {unread && (
                        <Badge color="blue" size="sm" variant="filled">
                          New
                        </Badge>
                      )}
                    </Group>
                    <Text size="sm" c="dimmed">
                      {n.body}
                    </Text>
                  </Stack>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                    {formatTime(n.created_at)}
                  </Text>
                </Group>
              </Paper>
            );
          })}

          {items.length < total && (
            <Group justify="center">
              <Button
                variant="subtle"
                loading={loadingMore}
                onClick={() => void load(items.length)}
              >
                Load more
              </Button>
            </Group>
          )}
        </Stack>
      )}
    </Stack>
  );
}
