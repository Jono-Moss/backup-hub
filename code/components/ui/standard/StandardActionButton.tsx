"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import type { IconType } from "react-icons";
import { useModal } from "../modal/ModalProvider";
import { useActionFeedback, type FeedbackOptions } from "@/components/ui/common/useActionFeedback";

type ActionButtonVariant = "standard" | "danger" | "outline" | "link";

type ActionButtonProps = {
    title: string;
    /** Shorter label for phones (below the `sm` breakpoint), so the button stays on one line. */
    shortTitle?: string;
    /** May return fail("…") (lib/action-result) to report a failure. */
    action: () => unknown | Promise<unknown>;
    /** Toast shown when the action succeeds. Failures always show an error toast. */
    successMessage?: FeedbackOptions["success"];
    variant?: ActionButtonVariant;
    confirmMessage?: string;
    pendingTitle?: string;
    disabled?: boolean;
    tooltip?: string;
    fullWidth?: boolean;
    compact?: boolean;
    /** Optional icon shown before the title. */
    icon?: IconType;
};

export function StandardActionButton({
    title,
    shortTitle,
    action,
    variant = "standard",
    confirmMessage,
    pendingTitle: pendingTitleProp,
    disabled = false,
    tooltip,
    fullWidth = false,
    compact = false,
    icon: Icon,
    successMessage,
}: ActionButtonProps) {
    const t = useTranslations("common");
    const pendingTitle = pendingTitleProp ?? t("processing");
    const [isPending, startTransition] = useTransition();
    const { confirm } = useModal();
    const run = useActionFeedback();

    // With a phone label, phones also get slightly tighter padding.
    const sizeStyle = compact
        ? "px-2.5 py-1 text-xs"
        : shortTitle
          ? "px-3 py-2.5 text-sm sm:px-5 whitespace-nowrap"
          : "px-5 py-2.5 text-sm";

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

        startTransition(async () => {
            await run(action, { success: successMessage });
        });
    };

    const button = (
        <button
            type="button"
            onClick={handleClick}
            disabled={disabled || isPending}
            className={`${Icon ? "inline-flex items-center gap-1.5" : ""} rounded-md font-medium ${sizeStyle} transition-colors disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed ${buttonStyle} ${fullWidth === true ? 'w-full' : ''}`}
        >
            {Icon && <Icon size={compact ? 14 : 16} aria-hidden="true" className="shrink-0" />}
            {isPending ? (
                pendingTitle
            ) : shortTitle ? (
                <>
                    <span className="sm:hidden">{shortTitle}</span>
                    <span className="hidden sm:inline">{title}</span>
                </>
            ) : (
                title
            )}
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