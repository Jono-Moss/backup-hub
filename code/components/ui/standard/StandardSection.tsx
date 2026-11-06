'use client'

type WidthTypeVariant = "full" | "half";

export function StandardSection({
  children,
  WidthVariant = "full",
  id,
}: {
  children: React.ReactNode;
  WidthVariant?: WidthTypeVariant;
  /** Anchor for in-page navigation (e.g. TaskSectionNav). */
  id?: string;
}) {
  let sectionStyle = "";

  switch (WidthVariant) {
    case "full":
      sectionStyle = "";
      break;

    case "half":
      sectionStyle = "max-w-2xl";
      break;
  }

  return (
    <section
      id={id}
      // scroll-mt keeps a #hash jump clear of the sticky header + section nav.
      className={`bg-white border border-line p-4 sm:p-6 rounded-md scroll-mt-28 md:scroll-mt-16 ${sectionStyle}`}
    >
      {children}
    </section>
  );
}
