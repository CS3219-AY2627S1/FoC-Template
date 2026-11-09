// AI-assisted: browse available errands page with reward filters, sort, and accept action.
// UI tweaks (Claude Opus 5.5): "Take Errands" framing, supplier-page filter layout
// and client-side search. Reviewed by authors.
import {
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconSearch } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OrderStatusBadge } from "../../components/StatusPill";
import { ApiError, type OrderResponse, ordersApi, parseUtcDate, suppliersApi } from "../../lib/api";
import { SUPPLIER_CATEGORIES, type Category } from "../../lib/types";

export default function BrowseErrands() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<OrderResponse[]>([]);
  const [supplierNames, setSupplierNames] = useState<Record<string, string>>({});
  const [minReward, setMinReward] = useState<number | "">("");
  const [maxReward, setMaxReward] = useState<number | "">("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [sortBy, setSortBy] = useState("deadline");
  const [sortOrder, setSortOrder] = useState("asc");

  useEffect(() => {
    suppliersApi
      .list({ includeInactive: false })
      .then((res) => {
        const map: Record<string, string> = {};
        for (const s of res.items) map[s.id] = s.name;
        setSupplierNames(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ordersApi
      .list({
        category: category ? [category] : undefined,
        min_reward: minReward || undefined,
        max_reward: maxReward || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      })
      .then((res) => {
        if (cancelled) return;
        setItems(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load errands");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, minReward, maxReward, sortBy, sortOrder]);

  // order-service has no text search, so filter the fetched page in the browser.
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((o) =>
      [o.name, o.details, supplierNames[o.supplier_id], o.pickup_location, o.delivery_location]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle)),
    );
  }, [items, q, supplierNames]);

  async function handleAccept(orderId: string) {
    try {
      await ordersApi.accept(orderId);
      window.dispatchEvent(new Event("credits-changed"));
      navigate("/deliveries");
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Failed",
        message:
          err instanceof ApiError ? err.message : "Could not accept errand",
      });
    }
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Take Errands</Title>
        <Text c="dimmed" size="sm">
          Run errands for fellow students around NUS and earn credits
        </Text>
      </div>

      <Stack gap="sm">
        <Group grow wrap="wrap">
          <TextInput
            leftSection={<IconSearch size={16} />}
            placeholder="Search errands..."
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
          />
          <Select
            placeholder="All categories"
            clearable
            data={SUPPLIER_CATEGORIES.map((c) => ({ value: c, label: c }))}
            value={category}
            onChange={(v) => setCategory(v as Category | null)}
          />
          <NumberInput
            placeholder="Min reward"
            min={1}
            value={minReward}
            onChange={(v) => setMinReward(typeof v === "number" ? v : "")}
          />
          <NumberInput
            placeholder="Max reward"
            min={1}
            value={maxReward}
            onChange={(v) => setMaxReward(typeof v === "number" ? v : "")}
          />
        </Group>
        <Group justify="space-between" wrap="wrap">
          <Text size="sm" c="dimmed">
            {visible.length} errand{visible.length === 1 ? "" : "s"}
          </Text>
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              Sort by
            </Text>
            <SegmentedControl
              size="xs"
              value={sortBy}
              onChange={setSortBy}
              data={[
                { label: "Deadline", value: "deadline" },
                { label: "Reward", value: "reward" },
              ]}
            />
            <SegmentedControl
              size="xs"
              value={sortOrder}
              onChange={setSortOrder}
              data={[
                { label: "Asc", value: "asc" },
                { label: "Desc", value: "desc" },
              ]}
            />
          </Group>
        </Group>
      </Stack>

      {error && (
        <Text c="red">{error}</Text>
      )}

      {loading && items.length === 0 ? (
        <Box style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
          <Loader />
        </Box>
      ) : visible.length === 0 ? (
        <Center h={160}>
          <Text c="dimmed">No errands match your filters.</Text>
        </Center>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
          {visible.map((order) => (
            <Card key={order.order_id} withBorder padding="md">
              <Text fw={600}>{order.name}</Text>
              <Text size="xs" c="dimmed">
                {supplierNames[order.supplier_id] ?? order.supplier_id}
              </Text>
              <Group justify="space-between">
                <Badge color="green">{order.reward} cr</Badge>
                <Text size="sm" c="dimmed">
                  {parseUtcDate(order.deadline).toLocaleString()}
                </Text>
              </Group>
              <Text size="sm">{order.pickup_location} → {order.delivery_location}</Text>
              <OrderStatusBadge status={order.status} />
              <Button fullWidth mt="sm" onClick={() => handleAccept(order.order_id)}>
                Accept
              </Button>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
