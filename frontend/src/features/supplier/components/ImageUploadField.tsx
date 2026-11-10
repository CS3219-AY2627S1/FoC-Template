import { useRef, useState } from "react";
import { UploadCloudIcon, XIcon } from "lucide-react";
import { toast } from "react-toastify";

import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { uploadSupplierImage } from "../services/supplier.service";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ACCEPTED_TYPES = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/avif",
];

const formatFileSize = (bytes: number): string => {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
};

interface ImageUploadFieldProps {
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
}

const ImageUploadField = ({ value, onChange, onBlur }: ImageUploadFieldProps) => {
    const [isUploading, setUploading] = useState(false);
    const [isDragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = async (file: File) => {
        if (!ACCEPTED_TYPES.includes(file.type)) {
            toast.error(
                `Only image files are allowed (jpeg, png, gif, webp, svg, avif). Got "${file.type || "unknown type"}".`,
            );
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            toast.error(
                `Image is too large (${formatFileSize(file.size)}). Max size is ${formatFileSize(MAX_FILE_SIZE)}.`,
            );
            return;
        }

        setUploading(true);
        try {
            const url = await uploadSupplierImage(file);
            onChange(url);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to upload image";
            toast.error(message);
        } finally {
            setUploading(false);
        }
    };

    const openPicker = () => {
        inputRef.current?.click();
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
    };

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = "";
    };

    const onRemove = () => {
        onChange("");
        onBlur?.();
    };

    return (
        <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={cn(
                "flex flex-col gap-2",
                isDragOver && "ring-2 ring-ring ring-offset-2 ring-offset-background",
            )}
        >
            {value ? (
                <div className="relative w-fit">
                    <img
                        src={value}
                        alt="Supplier location"
                        className="h-40 rounded-lg object-cover border border-border"
                    />
                    <Button
                        type="button"
                        variant="destructive"
                        size="icon-sm"
                        onClick={onRemove}
                        aria-label="Remove image"
                        title="Remove image"
                        className="absolute right-2 top-2"
                    >
                        <XIcon />
                    </Button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={openPicker}
                    disabled={isUploading}
                    className={cn(
                        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/40 p-6 text-center transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none",
                        isDragOver && "border-ring bg-muted/50",
                    )}
                >
                    <UploadCloudIcon className="size-8 text-muted-foreground" />
                    <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">
                            Drag &amp; drop an image here
                        </span>
                        <span className="text-xs text-muted-foreground">
                            or click to browse &middot; max {formatFileSize(MAX_FILE_SIZE)}
                        </span>
                    </div>
                </button>
            )}

            {value && (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openPicker}
                    isLoading={isUploading}
                    className="self-start"
                >
                    <UploadCloudIcon />
                    {isUploading ? "Uploading…" : "Change image"}
                </Button>
            )}

            <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                onChange={onInputChange}
                onChangeCapture={(e) => e.stopPropagation()}
                hidden
                aria-hidden
                disabled={isUploading}
            />
        </div>
    );
};

export default ImageUploadField;
