import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from 'react';
import type { Errand } from '@relay/contracts';
export type BubbleAnchor = {
    top: number;
    left: number;
    right: number;
    bottom: number;
};
export type RelayButtonVariant = 'primary' | 'secondary' | 'danger' | 'plain';
export type RelayButtonSize = 'default' | 'map-pill' | 'map-icon' | 'map-action';
export declare function RelayButton({ variant, scale, size, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: RelayButtonVariant;
    scale?: number;
    size?: RelayButtonSize;
    children: ReactNode;
}): import("react").JSX.Element;
export declare function ButtonWithImage({ imageUrl, imageAlt, fallback, variant, size, scale, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    imageUrl?: string | null;
    imageAlt?: string;
    fallback: ReactNode;
    children: ReactNode;
    variant?: RelayButtonVariant;
    size?: RelayButtonSize;
    scale?: number;
}): import("react").JSX.Element;
export declare function TextButton({ className, children, withBounce, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    withBounce?: boolean;
}): import("react").JSX.Element;
export declare function Spacer({ className }: {
    className?: string;
}): import("react").JSX.Element;
export declare function BubblePopover({ anchor, children, className, open, maxWidth, placement, }: {
    anchor?: BubbleAnchor;
    children: ReactNode;
    className?: string;
    open?: boolean;
    maxWidth?: number;
    placement?: 'auto' | 'above';
}): import("react").JSX.Element;
export declare function IconButton({ label, scale, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    scale?: number;
    children: ReactNode;
}): import("react").JSX.Element;
export declare function BackButton({ label, className, scale, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    label?: string;
    scale?: number;
}): import("react").JSX.Element;
export declare function CloseButton({ label, className, scale, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
    label?: string;
    scale?: number;
}): import("react").JSX.Element;
export declare function FilterIcon({ className }: {
    className?: string;
}): import("react").JSX.Element;
export declare function LocationIcon({ className }: {
    className?: string;
}): import("react").JSX.Element;
export declare function BoltIcon({ className }: {
    className?: string;
}): import("react").JSX.Element;
export declare function BellIcon({ className }: {
    className?: string;
}): import("react").JSX.Element;
export declare function ClipboardPlusIcon({ className }: {
    className?: string;
}): import("react").JSX.Element;
export declare function StorePlusIcon({ className }: {
    className?: string;
}): import("react").JSX.Element;
export declare function PencilIcon({ className }: {
    className?: string;
}): import("react").JSX.Element;
export declare function PlusIcon({ className }: {
    className?: string;
}): import("react").JSX.Element;
export declare function ClockIcon({ className }: {
    className?: string;
}): import("react").JSX.Element;
export declare function StatusBadge({ children, tone, }: {
    children: ReactNode;
    tone?: 'neutral' | 'success' | 'danger' | 'warning';
}): import("react").JSX.Element;
export declare function UpdatesCard({ errands, loading, error, onClose, onSelect, }: {
    errands: Errand[];
    loading?: boolean;
    error?: string;
    onClose: () => void;
    onSelect?: (errand: Errand) => void;
}): import("react").JSX.Element;
export declare function Spinner({ label }: {
    label?: string;
}): import("react").JSX.Element;
export declare function LoadingState({ label }: {
    label?: string;
}): import("react").JSX.Element;
export declare function RelayBrand({ className }: {
    className?: string;
}): import("react").JSX.Element;
export declare function CardView({ as, children, className, withGlow, ...props }: HTMLAttributes<HTMLElement> & {
    as?: 'div' | 'aside' | 'section';
    children: ReactNode;
    withGlow?: boolean;
}): import("react").JSX.Element;
export declare function GlassWindow({ children, background, className, withGlow, }: {
    children: ReactNode;
    background?: ReactNode;
    className?: string;
    withGlow?: boolean;
}): import("react").JSX.Element;
export declare function GlassCard({ as, children, className, variant, ...props }: HTMLAttributes<HTMLElement> & {
    as?: 'div' | 'aside' | 'section';
    children: ReactNode;
    variant?: 'glass' | 'plain';
}): import("react").JSX.Element;
export declare function RelayFormOverlay({ children, className, open, onClose, }: {
    children: ReactNode;
    className?: string;
    open?: boolean;
    onClose?: () => void;
}): import("react").JSX.Element | null;
export type RelayCardPlacement = 'top-left' | 'top-right' | 'center-right' | 'bottom-left' | 'bottom-right' | 'anchored';
export type RelayCardSize = 'small' | 'medium' | 'large';
export declare function RelayCardAnchor({ children, placement, size, anchor, preferredSide, offset, viewportPadding, className, style, }: {
    children: ReactNode;
    placement?: RelayCardPlacement;
    size?: RelayCardSize;
    anchor?: BubbleAnchor;
    preferredSide?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
    offset?: number;
    viewportPadding?: number;
    className?: string;
    style?: CSSProperties;
}): import("react").JSX.Element;
export declare function RelayFormSurface({ children, title, description, footer, onClose, className, headerVariant, as, style, }: {
    children: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    footer?: ReactNode;
    onClose?: () => void;
    className?: string;
    headerVariant?: 'default' | 'card';
    as?: 'div' | 'section' | 'aside';
    style?: CSSProperties;
}): import("react").JSX.Element;
export declare function RelayFormField({ label, hint, error, required, children, className, }: {
    label: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
    required?: boolean;
    children: ReactNode;
    className?: string;
}): import("react").JSX.Element;
export declare function RelayList({ children, className, ...props }: HTMLAttributes<HTMLUListElement> & {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function RelayListItem({ title, subtitle, meta, leading, trailing, onClick, className, }: {
    title: ReactNode;
    subtitle?: ReactNode;
    meta?: ReactNode;
    leading?: ReactNode;
    trailing?: ReactNode;
    onClick?: () => void;
    className?: string;
}): import("react").JSX.Element;
export declare function SlidingSegmentedControl<T extends string | number>({ options, value, onChange, ariaLabel, scale, size, className, cardExclusion, }: {
    options: ReadonlyArray<{
        value: T;
        label: ReactNode;
    }>;
    value: T;
    onChange: (value: T) => void;
    ariaLabel?: string;
    scale?: number;
    size?: 'default' | 'map';
    className?: string;
    cardExclusion?: string;
}): import("react").JSX.Element;
