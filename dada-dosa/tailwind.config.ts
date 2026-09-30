import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0D0D0D",        // near-black surface, from the logo background
        panel: "#161513",      // raised surface on top of ink
        panel2: "#1F1D19",     // deeper raised surface (inputs, hover states)
        line: "#332F27",       // hairline borders on dark
        gold: "#E8C468",       // primary accent — the "दादा" outline
        "gold-dim": "#B99A4E",
        cream: "#F6EFDD",      // primary text on dark
        muted: "#9A9284",      // secondary text on dark
        pink: "#C2185B",       // cloth accent — used sparingly, alerts/highlights
        leaf: "#4A7C3E",       // banana-leaf green — success/positive
        rust: "#B3432B",       // negative/danger, warm not clinical-red
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-manrope)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      borderRadius: {
        DEFAULT: "3px",
        sm: "2px",
        md: "4px",
        lg: "6px",
      },
    },
  },
  plugins: [],
};
export default config;
