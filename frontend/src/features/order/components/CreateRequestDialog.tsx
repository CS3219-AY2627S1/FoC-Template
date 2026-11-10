import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import CreateRequestForm from "@/features/order/components/CreateRequestForm";
import type { ReorderFormInput } from "../types/order.types";

type CreateRequestDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialValues?: Partial<ReorderFormInput>;
    showTrigger?: boolean;
};

const CreateRequestDialog = ({
    open,
    onOpenChange,
    initialValues,
    showTrigger = true,
}: CreateRequestDialogProps) => {

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogTrigger
                hidden={!showTrigger}
                render={
                    <Button
                        type="button"
                        variant="indigo"
                        className="flex items-center gap-2"
                    >
                        <PlusIcon className="stroke-3" />
                        Create Request
                    </Button>
                }
            />

            <DialogContent className="w-full md:max-w-xl! max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {initialValues ? "Reorder Request" : "Create Request"}
                    </DialogTitle>
                    {initialValues &&
                        <DialogDescription>
                            Please review the details of your previous request.
                        </DialogDescription>
                    }
                </DialogHeader>

                {open && (
                    <CreateRequestForm
                        onCancel={() => onOpenChange(false)}
                        initialValues={initialValues}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
};

export default CreateRequestDialog;