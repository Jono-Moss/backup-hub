import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F4F0",
        ink: "#1B1F27",
        muted: "#6B7280",
        line: "#E2E0D8",
        primary: {
          DEFAULT: "#35be9e",
          dark: "#164F41",
          light: "#E4EFEC",
        },
        danger: {
          DEFAULT: "#B23A2E",
          dark: "#862b22",
          light: "#F6E7E4",
        },
        warn: {
          DEFAULT: "#9A6B1F",
          light: "#F5EEDF",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        DEFAULT: "6px",
      },
    },
  },
  plugins: [],
} satisfies Config;
