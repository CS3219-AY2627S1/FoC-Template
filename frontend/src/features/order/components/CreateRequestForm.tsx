import { useForm } from "@tanstack/react-form";
import { createRequestSchema, type CreateRequestFormData } from "@/features/order/schemas/create-request.schema";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import SupplierSelect from "./SupplierSelect";
import useCreateRequest from "@/features/order/hooks/useCreateRequest";
import useCreditBalance from "@/features/credit/hooks/useCreditBalance";
import DateTimePicker from "./DateTimePicker";
import type { ReorderFormInput } from "../types/order.types";

interface CreateRequestFormProps {
    onCancel: () => void;
    initialValues?: Partial<ReorderFormInput>;
}

const CreateRequestForm = ({
    onCancel,
    initialValues
}: CreateRequestFormProps) => {
    const { createRequest, isPending } = useCreateRequest();
    const credit = useCreditBalance();
    // A new account is granted credits asynchronously; reserving before then fails.
    const isProvisioning = credit.state.status === "provisioning" || credit.state.status === "delayed";

    const form = useForm({
        defaultValues: {
            name: initialValues?.name ?? "",
            description: initialValues?.description ?? "",
            pickupSupplierId: initialValues?.pickupSupplierId ?? "",
            deliverySupplierId: initialValues?.deliverySupplierId ?? "",
            offeredCredits: initialValues?.offeredCredits ?? "",
            expiryAt: initialValues?.expiryAt ?? "", // Don’t reuse an old deadline; it may already have passed.
            remarks: initialValues?.remarks ?? "",
        },
        validators: {
            onSubmit: createRequestSchema,
        },
        onSubmit: async ({ value }) => {
            if (isProvisioning) return;
            const parsedData: CreateRequestFormData = createRequestSchema.parse(value);
            createRequest(parsedData, {
                onSuccess: () => {
                    onCancel();
                },
            });
        },
    });

    return (
        <>
            <form
                onSubmit={e => {
                    e.preventDefault();
                    form.handleSubmit();
                }}
                className="flex flex-col gap-4 w-full">
                <FieldGroup>
                    <form.Field
                        name="name"
                        children={field => {
                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                            return (
                                <Field data-invalid={isInvalid}>
                                    <FieldLabel htmlFor={field.name}>Request Name</FieldLabel>
                                    <Input
                                        id={field.name}
                                        name={field.name}
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={e => field.handleChange(e.target.value)}
                                        aria-invalid={isInvalid}
                                        placeholder="e.g. Buy coffee"
                                    />
                                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                                </Field>
                            );
                        }}
                    />
                    <form.Field
                        name="description"
                        children={field => {
                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                            return (
                                <Field data-invalid={isInvalid}>
                                    <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                                    <Textarea
                                        id={field.name}
                                        name={field.name}
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={e => field.handleChange(e.target.value)}
                                        aria-invalid={isInvalid}
                                        placeholder="Desribe your request here"
                                    />
                                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                                </Field>
                            );
                        }}
                    />
                    <div className="flex w-full flex-col md:flex-row gap-5">
                        <form.Field
                            name="pickupSupplierId"
                            children={field => {
                                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                                return (
                                    <Field data-invalid={isInvalid} className="min-w-0 flex-1">
                                        <FieldLabel htmlFor={field.name}>Pickup Location</FieldLabel>
                                        <SupplierSelect
                                            value={field.state.value}
                                            isInvalid={isInvalid}
                                            onChange={field.handleChange}
                                            placeholder="Select pickup location"
                                            displayName={
                                                initialValues?.isSuppliersLoading
                                                    ? "Loading pickup location…"
                                                    : initialValues?.pickupSupplierName
                                            }
                                        />
                                        {isInvalid && (<FieldError errors={field.state.meta.errors} />)}
                                    </Field>
                                );
                            }}
                        />
                        <form.Field
                            name="deliverySupplierId"
                            validators={{
                                onChangeListenTo: ["pickupSupplierId"],
                                onChange: ({ value, fieldApi }) => {
                                    const pickupId = fieldApi.form.getFieldValue("pickupSupplierId");

                                    return value && pickupId === value
                                        ? { message: "Pickup and delivery locations must be different" }
                                        : undefined;
                                },
                            }}
                        >
                            {field => {
                                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                                return (
                                    <Field data-invalid={isInvalid} className="min-w-0 flex-1">
                                        <FieldLabel htmlFor={field.name}>Delivery Location</FieldLabel>
                                        <SupplierSelect
                                            value={field.state.value}
                                            isInvalid={isInvalid}
                                            onChange={field.handleChange}
                                            placeholder="Select delivery location"
                                            displayName={
                                                initialValues?.isSuppliersLoading
                                                    ? "Loading delivery location…"
                                                    : initialValues?.deliverySupplierName
                                            }
                                        />
                                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                                    </Field>
                                );
                            }}
                        </form.Field>
                    </div>
                    <div className="flex w-full flex-col md:flex-row gap-5">
                        <form.Field
                            name="offeredCredits"
                            children={field => {
                                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                                return (
                                    <Field data-invalid={isInvalid}>
                                        <FieldLabel htmlFor={field.name}>Offered Credits</FieldLabel>
                                        <Input
                                            id={field.name}
                                            name={field.name}
                                            value={field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={e => field.handleChange(e.target.value.trim())}
                                            aria-invalid={isInvalid}
                                            type="number"
                                            placeholder="e.g. 10"
                                        />
                                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                                    </Field>
                                );
                            }}
                        />
                        <form.Field
                            name="expiryAt"
                            children={field => {
                                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                                return (
                                    <Field data-invalid={isInvalid}>
                                        <FieldLabel htmlFor={field.name}>Completion Deadline</FieldLabel>
                                        <DateTimePicker
                                            value={field.state.value}
                                            isInvalid={isInvalid}
                                            onChange={field.handleChange}
                                            onBlur={field.handleBlur}
                                        />
                                        {isInvalid && (<FieldError errors={field.state.meta.errors} />)}
                                    </Field>
                                );
                            }}
                        />
                    </div>
                    <form.Field
                        name="remarks"
                        children={field => {
                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                            return (
                                <Field data-invalid={isInvalid}>
                                    <FieldLabel htmlFor={field.name}>Remarks</FieldLabel>
                                    <Textarea
                                        id={field.name}
                                        name={field.name}
                                        value={field.state.value}
                                        onBlur={field.handleBlur}
                                        onChange={e => field.handleChange(e.target.value)}
                                        aria-invalid={isInvalid}
                                        placeholder="Optional remarks for your request"
                                    />
                                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                                </Field>
                            );
                        }}
                    />
                </FieldGroup>
                {isProvisioning && (
                    <div role="status" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
                        <p className="font-medium text-slate-900">
                            {credit.state.status === "delayed" ? "Credit setup is taking longer than expected" : "Setting up credits"}
                        </p>
                        <p className="text-slate-600">Your credit account is being set up. You can submit once it's ready.</p>
                        {credit.state.status === "delayed" && (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={credit.fetchStatus !== "idle"}
                                onClick={() => { void credit.retry(); }}
                            >
                                Retry credit setup
                            </Button>
                        )}
                    </div>
                )}
                <div className="flex flex-row gap-3 items-center justify-end">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        className="w-fit"
                        variant="indigo"
                        isLoading={isPending}
                        disabled={isProvisioning || isPending}
                    >
                        Submit Request
                    </Button>
                </div>
            </form>
        </>
    );
}

export default CreateRequestForm;