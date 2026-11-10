import { useForm } from "@tanstack/react-form";
import { useRenewRequest } from "../hooks/useRenewRequest";
import type { Order } from "../types/order.types";
import { renewRequestSchema, type RenewRequestFormInput } from "../schemas/renew-request.schema";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import DateTimePicker from "./DateTimePicker";
import { Button } from "@/components/ui/button";

type RenewRequestDialogProps = {
    order: Order;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const RenewRequestDialog = ({
    order,
    open,
    onOpenChange
}: RenewRequestDialogProps) => {
    const { renewRequest, isPending } = useRenewRequest();

    const resetForm = () => {
        form.reset();
        form.setFieldValue("expiryAt", "");
        form.setFieldValue("expectedVersion", order.version);
    };


    const form = useForm({
        defaultValues: {
            expiryAt: "",
            expectedVersion: order.version,
        } satisfies RenewRequestFormInput,
        validators: {
            onSubmit: renewRequestSchema,
        },
        onSubmit: async ({ value }) => {
            const payload = renewRequestSchema.parse(value);
            await renewRequest({
                orderId: order.id,
                payload: payload
            });

            onOpenChange(false);
            resetForm();
        }
    });

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) {
                    resetForm();
                }
                onOpenChange(nextOpen);
            }}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>
                        Renew Request
                    </DialogTitle>
                    <DialogDescription>
                        Choose a new deadline for a courier to accept this request.
                    </DialogDescription>
                </DialogHeader>


                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.handleSubmit();
                    }}
                    className="flex flex-col gap-4"
                >
                    <FieldGroup>
                        <form.Field
                            name="expiryAt"
                            children={field => {
                                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                                return (
                                    <Field data-invalid={isInvalid}>
                                        <FieldLabel htmlFor={field.name}>New Completion Deadline</FieldLabel>
                                        <div className="w-full lg:w-3/4">
                                            <DateTimePicker
                                                value={field.state.value}
                                                isInvalid={isInvalid}
                                                onChange={field.handleChange}
                                                onBlur={field.handleBlur}
                                            />
                                        </div>
                                        {isInvalid && (<FieldError errors={field.state.meta.errors} />)}
                                    </Field>
                                );
                            }}
                        />
                    </FieldGroup>

                    <div className="flex justify-end gap-2 pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => { onOpenChange(false); resetForm(); }}
                        >
                            Cancel
                        </Button>

                        <Button
                            type="submit"
                            variant="indigo"
                            disabled={isPending}
                            isLoading={isPending}
                        >
                            Renew request
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

export default RenewRequestDialog;