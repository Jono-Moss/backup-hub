"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonVariant = "standard" | "danger" | "disabled";

type SubmitButtonProps = {
  title: string;
  pendingTitle?: string;
  variant?: SubmitButtonVariant;
  fullWidth?: boolean;
};

export function StandardSubmitButton({
  title,
  pendingTitle = "Processing...",
  variant = "standard",
  fullWidth = false
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  let buttonStyle = "";

  switch (variant) {
    case "standard":
      buttonStyle =
        "bg-primary text-white border-b-primary-dark ";
      break;

    case "danger":
      buttonStyle =
        "bg-danger text-white border-b-danger-dark ";
      break;

    case "disabled":
      buttonStyle =
        "bg-primary text-white opacity-50 cursor-not-allowed";
      break;
  }

  const isDisabled = pending || variant === "disabled";

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className={`${buttonStyle} rounded-md border-b-2 hover:border-b-transparent text-sm font-medium px-5 py-2.5 transition-colors disabled:border-b-0 disabled:opacity-50 shadow-inner hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.25)] ${fullWidth === true ? 'w-full' : ''}`}
    >
      {pending ? pendingTitle : title}
    </button>
  );
}