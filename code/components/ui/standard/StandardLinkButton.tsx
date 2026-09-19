import Link from "next/link";

type LinkButtonVariant = "standard" | "danger" | "disabled";

export function StandardLinkButton({
  href,
  title,
  variant = "standard",
  compact = false,
}: {
  href: string;
  title: string;
  variant?: LinkButtonVariant;
  compact?: boolean;
}) {
  let linkStyle = "";

  switch (variant) {
    case "standard":
      linkStyle = "text-white";
      break;

    case "danger":
      linkStyle = "text-danger";
      break;

    case "disabled":
      linkStyle = "opacity-50 pointer-events-none cursor-not-allowed";
      break;
  }

  const sizeStyle = compact ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm";

  return (
    <Link
      href={href}
      className={`rounded rounded-md bg-primary font-medium ${sizeStyle} transition-colors border-b-primary-dark border-b-2 hover:border-b-transparent shadow-inner hover:shadow-[inset_0_2px_4px_rgba(0,0,0,0.25)] ${linkStyle}`}
      aria-disabled={variant === "disabled"}
      tabIndex={variant === "disabled" ? -1 : undefined}
    >
      {title}
    </Link>
  );
}