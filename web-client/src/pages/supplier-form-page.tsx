/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Scope: Implemented Supplier browsing/management UI and refined validation, filters and error states.
 * Author review: I validated correctness, and added boundary checks.
 */

import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { isApiRequestError } from "../api/client";
import { type Category, type Supplier, type SupplierInput, type SupplierStatus, supplierService } from "../api/supplier-service";
import { useAuth } from "../app/use-auth";
import { FormField } from "../components/form-field";
import { SupplierShell } from "../components/supplier-shell";

type FormValues = {
  name: string;
  categories: string[];
  buildingArea: string;
  pickupDescription: string;
  floor: string;
  latitude: string;
  longitude: string;
  openingTime: string;
  closingTime: string;
  imageUrl: string;
  status: SupplierStatus;
};

const blankForm: FormValues = {
  name: "", categories: [], buildingArea: "", pickupDescription: "", floor: "", latitude: "", longitude: "", openingTime: "", closingTime: "", imageUrl: "", status: "ACTIVE",
};

const fieldNames: Record<string, keyof FormValues> = {
  name: "name", categories: "categories", building_area: "buildingArea", pickup_location_description: "pickupDescription", floor: "floor", latitude: "latitude", longitude: "longitude", opening_time: "openingTime", closing_time: "closingTime", image_url: "imageUrl", status: "status",
};

function formFromSupplier(supplier: Supplier): FormValues {
  return {
    name: supplier.name,
    categories: supplier.categories,
    buildingArea: supplier.building_area,
    pickupDescription: supplier.pickup_location_description,
    floor: supplier.floor ?? "",
    latitude: supplier.latitude?.toString() ?? "",
    longitude: supplier.longitude?.toString() ?? "",
    openingTime: supplier.opening_time ?? "",
    closingTime: supplier.closing_time ?? "",
    imageUrl: supplier.image_url ?? "",
    status: supplier.status,
  };
}

function validate(values: FormValues): { payload?: SupplierInput; errors: Partial<Record<keyof FormValues, string>> } {
  const errors: Partial<Record<keyof FormValues, string>> = {};
  if (!values.name.trim()) errors.name = "Enter a supplier name.";
  if (!values.categories.length) errors.categories = "Select at least one category.";
  if (!values.buildingArea.trim()) errors.buildingArea = "Enter a building or campus area.";
  if (!values.pickupDescription.trim()) errors.pickupDescription = "Describe the pickup location.";

  const latitudeText = values.latitude.trim();
  const longitudeText = values.longitude.trim();
  if (Boolean(latitudeText) !== Boolean(longitudeText)) {
    errors.latitude = "Enter both coordinates or leave both blank.";
    errors.longitude = "Enter both coordinates or leave both blank.";
  }
  const latitude = latitudeText ? Number(latitudeText) : null;
  const longitude = longitudeText ? Number(longitudeText) : null;
  if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) errors.latitude = "Use a latitude from -90 to 90.";
  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) errors.longitude = "Use a longitude from -180 to 180.";

  const openingTime = values.openingTime.trim();
  const closingTime = values.closingTime.trim();
  if (Boolean(openingTime) !== Boolean(closingTime)) {
    errors.openingTime = "Enter both times or leave both blank.";
    errors.closingTime = "Enter both times or leave both blank.";
  }
  const timePattern = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
  if (openingTime && !timePattern.test(openingTime)) errors.openingTime = "Use 24-hour HH:mm, such as 09:00.";
  if (closingTime && !timePattern.test(closingTime)) errors.closingTime = "Use 24-hour HH:mm, such as 18:00.";

  const imageUrl = values.imageUrl.trim();
  if (imageUrl) {
    try {
      if (!["http:", "https:"].includes(new URL(imageUrl).protocol)) errors.imageUrl = "Use an HTTP or HTTPS URL.";
    } catch {
      errors.imageUrl = "Enter a valid HTTP or HTTPS URL.";
    }
  }

  if (Object.keys(errors).length) return { errors };
  return { errors, payload: {
    name: values.name.trim(),
    categories: values.categories,
    building_area: values.buildingArea.trim(),
    pickup_location_description: values.pickupDescription.trim(),
    floor: values.floor.trim() || null,
    latitude, longitude,
    opening_time: openingTime || null,
    closing_time: closingTime || null,
    image_url: imageUrl || null,
    status: values.status,
  } };
}

export function SupplierFormPage() {
  const { supplierId } = useParams();
  const editing = Boolean(supplierId);
  const { withCurrentAccess } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormValues>(blankForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(null);
    setFormError(null);
    const categoriesRequest = withCurrentAccess((token) => supplierService.categories(token));
    const supplierRequest = supplierId ? withCurrentAccess((token) => supplierService.detail(supplierId, token, true)) : Promise.resolve(null);
    Promise.all([categoriesRequest, supplierRequest])
      .then(([items, supplier]) => { if (active) { setCategories(items); setForm(supplier ? formFromSupplier(supplier) : blankForm); } })
      .catch((failure) => { if (active) setLoadError(isApiRequestError(failure) ? failure.message : "The supplier form could not load. Try again."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [supplierId, reload, withCurrentAccess]);

  function change<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function toggleCategory(code: string) {
    setForm((current) => ({ ...current, categories: current.categories.includes(code) ? current.categories.filter((item) => item !== code) : [...current.categories, code] }));
    setErrors((current) => ({ ...current, categories: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = validate(form);
    setErrors(checked.errors);
    setFormError(null);
    const payload = checked.payload;
    if (!payload) return;
    setBusy(true);
    try {
      const saved = supplierId
        ? await withCurrentAccess((token) => supplierService.update(supplierId, payload, token))
        : await withCurrentAccess((token) => supplierService.create(payload, token));
      navigate(`/admin/suppliers/${saved.id}`, { replace: true, state: { notice: editing ? "Supplier updated." : "Supplier created." } });
    } catch (failure) {
      if (isApiRequestError(failure)) {
        const nextErrors: Partial<Record<keyof FormValues, string>> = {};
        for (const item of failure.fieldErrors) {
          const field = fieldNames[item.field.split(".").at(-1) ?? ""];
          if (field) nextErrors[field] = item.message;
        }
        setErrors(nextErrors);
        setFormError(failure.message);
      } else {
        setFormError("We could not save this supplier. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const cancelPath = supplierId ? `/admin/suppliers/${supplierId}` : "/admin/suppliers";
  return <SupplierShell>
    <Link className="supplier-back-link" to={cancelPath}>← Back to suppliers</Link>
    <div className="supplier-page-heading"><div><h1>{editing ? "Edit supplier" : "Add supplier"}</h1><p>{editing ? "Update supplier information and availability." : "Required fields are marked with an asterisk."}</p></div></div>
    {loading ? <p className="supplier-state" role="status">Loading supplier form…</p> : loadError ? <section className="supplier-state supplier-state-error" role="alert"><h2>Supplier form could not load</h2><p>{loadError}</p><button className="supplier-apply-button" onClick={() => setReload((value) => value + 1)} type="button">Try again</button></section> : <form className="supplier-form" noValidate onSubmit={(event) => void submit(event)}>
      {formError ? <p className="supplier-dialog-error" role="alert">{formError}</p> : null}
      <div className="supplier-form-grid">
        <FormField error={errors.name} label="Supplier name *" onChange={(event) => change("name", event.target.value)} placeholder="Enter supplier name" required value={form.name} />
        <FormField error={errors.buildingArea} label="Building / campus area *" onChange={(event) => change("buildingArea", event.target.value)} placeholder="Enter building or campus area" required value={form.buildingArea} />
        <fieldset className="supplier-form-categories"><legend>Categories * <span>Select one or more</span></legend><div>{categories.map((category) => <label key={category.code}><input checked={form.categories.includes(category.code)} onChange={() => toggleCategory(category.code)} type="checkbox" />{category.display_name}</label>)}</div>{errors.categories ? <p className="field-error" role="alert">{errors.categories}</p> : null}</fieldset>
        <div className="supplier-form-wide"><FormField error={errors.pickupDescription} label="Pickup location description *" onChange={(event) => change("pickupDescription", event.target.value)} placeholder="Describe the exact pickup point" required value={form.pickupDescription} /></div>
        <FormField error={errors.floor} label="Floor (optional)" onChange={(event) => change("floor", event.target.value)} placeholder="e.g. Level 1" value={form.floor} />
        <FormField error={errors.latitude} inputMode="decimal" label="Latitude (optional)" onChange={(event) => change("latitude", event.target.value)} placeholder="e.g. 1.2966" value={form.latitude} />
        <FormField error={errors.longitude} inputMode="decimal" label="Longitude (optional)" onChange={(event) => change("longitude", event.target.value)} placeholder="e.g. 103.7794" value={form.longitude} />
        <FormField error={errors.openingTime} hint="Use 24-hour HH:mm." inputMode="numeric" label="Opening time (optional)" onChange={(event) => change("openingTime", event.target.value)} placeholder="09:00" value={form.openingTime} />
        <FormField error={errors.closingTime} inputMode="numeric" label="Closing time (optional)" onChange={(event) => change("closingTime", event.target.value)} placeholder="18:00" value={form.closingTime} />
        <div className="supplier-form-wide"><FormField error={errors.imageUrl} hint="Use an HTTP or HTTPS image URL." label="Image URL (optional)" onChange={(event) => change("imageUrl", event.target.value)} placeholder="https://..." value={form.imageUrl} /></div>
        <label className="supplier-form-status">Operational status *<select onChange={(event) => change("status", event.target.value as SupplierStatus)} value={form.status}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select>{errors.status ? <span className="field-error" role="alert">{errors.status}</span> : null}</label>
      </div>
      <div className="supplier-form-actions"><Link className="supplier-form-cancel" to={cancelPath}>Cancel</Link><button className="supplier-primary-action" disabled={busy} type="submit">{busy ? "Saving…" : editing ? "Save changes" : "Create supplier"}</button></div>
    </form>}
  </SupplierShell>;
}
