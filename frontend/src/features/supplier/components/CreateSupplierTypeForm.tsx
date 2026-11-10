import { useMutation } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { toast } from "react-toastify";
import { supplierTypeFormSchema } from "../schemas/supplier.schema";
import { createSupplierType } from "../services/supplier.service";
import type { ParsedError } from "@/utils/errorHandler";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface CreateSupplierTypeFormProps {
    submitLabel: string;
    onSuccess: () => void;
    onCancel: () => void;
}

const CreateSupplierTypeForm = ({ submitLabel, onSuccess, onCancel }: CreateSupplierTypeFormProps) => {
    const { mutate, isPending } = useMutation({
        mutationFn: createSupplierType,
        onSuccess: () => {
            toast.success("Supplier type created");
            onSuccess();
        },
        onError: (error: ParsedError) => {
            toast.error(error.message);
        },
    });

    const form = useForm({
        defaultValues: {
            type: '',
        },
        validators: {
            onSubmit: supplierTypeFormSchema,
        },
        onSubmit: async ({ value }) => {
            mutate(value.type);
        }
    });

    return (
        <Card className="w-full md:w-2/3 p-5">
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    form.handleSubmit()
                }}
                className="flex flex-col gap-5"
            >
                <FieldGroup>
                    <form.Field name="type">
                        {(field) => {
                            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                            return (
                                <Field data-invalid={isInvalid}>
                                    <FieldLabel htmlFor={field.name}>Create New Type</FieldLabel>
                                    <FieldDescription>Input a new supplier type that does not exist yet.</FieldDescription>
                                    <FieldContent>
                                        <Input
                                            id={field.name}
                                            name={field.name}
                                            value={field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                            aria-invalid={isInvalid}
                                            placeholder="Enter new supplier type"
                                            className="overflow-hidden text-ellipsis whitespace-nowrap"
                                        />
                                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                                    </FieldContent>
                                </Field>
                            );
                        }}
                    </form.Field>
                </FieldGroup>

                <div className="flex items-center justify-end gap-3 flex-col sm:flex-row">
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="indigo" isLoading={isPending}>
                        {submitLabel}
                    </Button>
                </div>
            </form>
        </Card>
    )
}

export default CreateSupplierTypeForm;
