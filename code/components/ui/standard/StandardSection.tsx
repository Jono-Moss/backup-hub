'use client'

type WidthTypeVariant = "full" | "half";

export function StandardSection({
  children,
  WidthVariant = "full",
}: {
  children: React.ReactNode;
  WidthVariant?: WidthTypeVariant;
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
      className={`bg-white border border-line p-6 rounded-md ${sectionStyle}`}
    >
      {children}
    </section>
  );
}