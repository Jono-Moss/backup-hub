"use client";

import { useTransition } from "react";
import { useModal } from "../modal/ModalProvider";

type ActionButtonVariant = "standard" | "danger" | "outline" | "link";

type ActionButtonProps = {
    title: string;
    action: () => void | Promise<void>;
    variant?: ActionButtonVariant;
    confirmMessage?: string;
    pendingTitle?: string;
    disabled?: boolean;
    tooltip?: string;
    fullWidth?: boolean;
    compact?: boolean;
};

export function StandardActionButton({
    title,
    action,
    variant = "standard",
    confirmMessage,
    pendingTitle = "Processing...",
    disabled = false,
    tooltip,
    fullWidth = false,
    compact = false
}: ActionButtonProps) {
    const [isPending, startTransition] = useTransition();
    const { confirm } = useModal();

    const sizeStyle = compact ? "px-2.5 py-1 text-xs" : "px-5 py-2.5 text-sm";

    let buttonStyle = "";

    switch (variant) {
        case "standard":
            buttonStyle =
                "bg-primary text-white border-b-primary-dark border-b-2 hover:border-b-transparent disabled:border-b-0 shadow-inner hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.25)]";
            break;

        case "danger":
            buttonStyle = "text-danger hover:underline";
            break;

        case "outline":
            buttonStyle = "rounded-md border border-line text-ink hover:border-primary";
            break;

        case "link":
            buttonStyle = "text-primary hover:underline";
            break;
    }

    const handleClick = async () => {
        if (disabled || isPending) {
            return;
        }

        if (confirmMessage) {
            const confirmed = await confirm({ message: confirmMessage, danger: variant === "danger" });
            if (!confirmed) return;
        }

        startTransition(() => {
            action();
        });
    };

    const button = (
        <button
            type="button"
            onClick={handleClick}
            disabled={disabled || isPending}
            className={`rounded-md font-medium ${sizeStyle} transition-colors disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed ${buttonStyle} ${fullWidth === true ? 'w-full' : ''}`}
        >
            {isPending ? pendingTitle : title}
        </button>
    );

    if (tooltip) {
        return (
            <span className="relative inline-block group">
                {button}

                <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white group-hover:block">
                    {tooltip}
                </span>
            </span>
        );
    }

    return button;
}