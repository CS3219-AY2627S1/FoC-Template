// AI-assisted: create-order form with supplier select, deadline validation, and supplierId query param pre-selection.
import {
  ActionIcon,
  Alert,
  Button,
  Center,
  Group,
  Input,
  Loader,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconCurrentLocation } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LocationPickerModal } from "../../components/LocationPickerModal";
import { ApiError, type OrderCreate, ordersApi, suppliersApi } from "../../lib/api";
import type { Supplier } from "../../lib/types";

/** Builds the pickup address shown for a supplier from its location fields. */
function supplierPickupLocation(supplier: Supplier): string {
  const parts = [supplier.building, supplier.floor, supplier.locationDescription]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : supplier.name;
}

export default function CreateOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);

  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [reward, setReward] = useState<number | "">(1);
  const [deadline, setDeadline] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [deliveryCoords, setDeliveryCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const [deadlineError, setDeadlineError] = useState<string | null>(null);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pickerOpen, picker] = useDisclosure(false);

  useEffect(() => {
    let cancelled = false;
    suppliersApi
      .list({ includeInactive: false })
      .then((res) => {
        if (cancelled) return;
        const active = res.items.filter((s) => s.active);
        setSuppliers(active);
        const preselect = searchParams.get("supplierId");
        if (preselect && active.some((s) => s.id === preselect)) {
          setSupplierId(preselect);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSuppliers(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-fill the pickup address from the selected supplier's location.
  useEffect(() => {
    if (!supplierId) return;
    const supplier = suppliers.find((s) => s.id === supplierId);
    if (supplier) {
      setPickupLocation(supplierPickupLocation(supplier));
    }
  }, [supplierId, suppliers]);

  const selectedSupplier =
    suppliers.find((s) => s.id === supplierId) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDeadlineError(null);
    setRewardError(null);
    setSubmitError(null);

    let valid = true;

    if (!deadline || new Date(deadline) <= new Date()) {
      setDeadlineError("Deadline must be in the future");
      valid = false;
    }

    if (!reward || (reward as number) <= 0) {
      setRewardError("Reward must be greater than 0");
      valid = false;
    }

    if (!valid) return;

    if (!supplierId) {
      setSubmitError("Please select a supplier");
      return;
    }

    const body: OrderCreate = {
      name,
      details,
      reward: reward as number,
      deadline: new Date(deadline).toISOString(),
      supplier_id: supplierId ?? "",
      pickup_location: pickupLocation,
      delivery_location: deliveryLocation,
      delivery_latitude: deliveryCoords?.latitude ?? null,
      delivery_longitude: deliveryCoords?.longitude ?? null,
    };

    setSubmitting(true);
    try {
      await ordersApi.create(body);
      navigate("/orders/mine");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingSuppliers) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    );
  }

  return (
    <Stack gap="lg" maw={600}>
      <Title order={2}>Request Errand</Title>

      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <Select
            label="Supplier"
            placeholder="Select a supplier"
            required
            searchable
            data={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            value={supplierId}
            onChange={setSupplierId}
          />

          <TextInput
            label="Name"
            placeholder="Errand name"
            required
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
          />

          <Textarea
            label="Details"
            placeholder="Describe what needs to be done"
            required
            value={details}
            onChange={(e) => setDetails(e.currentTarget.value)}
          />

          <NumberInput
            label="Reward (credits)"
            placeholder="1"
            required
            min={1}
            value={reward}
            onChange={(v) => setReward(v as number | "")}
            error={rewardError}
          />

          <TextInput
            label="Deadline"
            type="datetime-local"
            required
            value={deadline}
            onChange={(e) => setDeadline(e.currentTarget.value)}
            error={deadlineError}
          />

          <TextInput
            label="Pickup location"
            placeholder="Where to pick up"
            required
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.currentTarget.value)}
          />

          <Stack gap={4}>
            <Group gap={4} wrap="nowrap">
              <Input.Label htmlFor="delivery-location" required>
                Delivery location
              </Input.Label>
              <Tooltip label="Pick on map" withArrow>
                <ActionIcon
                  type="button"
                  size="xs"
                  variant="subtle"
                  aria-label="Pick delivery location on map"
                  onClick={picker.open}
                >
                  <IconCurrentLocation size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
            <TextInput
              id="delivery-location"
              placeholder="Where to deliver"
              required
              value={deliveryLocation}
              onChange={(e) => setDeliveryLocation(e.currentTarget.value)}
            />
          </Stack>

          {submitError && (
            <Alert color="red" title="Error">
              <Text size="sm">{submitError}</Text>
            </Alert>
          )}

          <Button type="submit" loading={submitting}>
            Submit
          </Button>
        </Stack>
      </form>

      <LocationPickerModal
        opened={pickerOpen}
        onClose={picker.close}
        onPick={(picked) => {
          setDeliveryLocation(picked.address);
          setDeliveryCoords({
            latitude: picked.latitude,
            longitude: picked.longitude,
          });
        }}
        initialLatitude={selectedSupplier?.latitude ?? null}
        initialLongitude={selectedSupplier?.longitude ?? null}
      />
    </Stack>
  );
}
