// AI-assisted (GitHub Copilot Chat, DeepSeek V4.1 Flash): supplier map page
// that renders the campus map at the supplier's coordinates. Reviewed by authors.
import {
  Alert,
  Anchor,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CampusMap } from "../../components/CampusMap";
import { ApiError, suppliersApi } from "../../lib/api";
import type { Supplier } from "../../lib/types";

export default function SupplierMap() {
  const { id } = useParams<{ id: string }>();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    suppliersApi
      .get(id)
      .then((s) => !cancelled && setSupplier(s))
      .catch(
        (err) =>
          !cancelled &&
          setError(err instanceof ApiError ? err.message : "Failed to load"),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    );
  }

  if (error || !supplier) {
    return (
      <Stack>
        <Anchor component={Link} to="/suppliers">
          <Group gap={4}>
            <IconArrowLeft size={16} /> Back to suppliers
          </Group>
        </Anchor>
        <Alert color="red" title="Error">
          {error ?? "Supplier not found"}
        </Alert>
      </Stack>
    );
  }

  const latitude = supplier.latitude;
  const longitude = supplier.longitude;
  const location = [supplier.building, supplier.floor, supplier.locationDescription]
    .filter(Boolean)
    .join(", ");

  return (
    <Stack gap="lg">
      <Anchor component={Link} to={`/suppliers/${supplier.id}`}>
        <Group gap={4}>
          <IconArrowLeft size={16} /> Back to supplier
        </Group>
      </Anchor>

      <div>
        <Title order={2}>{supplier.name}</Title>
        <Text c="dimmed" size="sm">
          {location || "Campus location"}
        </Text>
      </div>

      {latitude != null && longitude != null ? (
        <CampusMap
          latitude={latitude}
          longitude={longitude}
          label={supplier.name}
        />
      ) : (
        <Alert color="yellow" title="No location yet">
          This supplier has no coordinates, so it cannot be shown on the map.
        </Alert>
      )}
    </Stack>
  );
}
