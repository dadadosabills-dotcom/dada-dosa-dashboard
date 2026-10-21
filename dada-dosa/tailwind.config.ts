import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./lib/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
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
        "leaf-deep": "#16241A", // banana-leaf shadow, used for ambient glow and tinted surfaces
        "pink-soft": "#E0709A", // lighter cloth pink, readable as small text on dark
        ember: "#E39A3B",       // dosa-tawa amber, for warm secondary highlights
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "Consolas", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(232,196,104,0.07) inset, 0 8px 24px -12px rgba(0,0,0,0.7)",
        lift: "0 1px 0 0 rgba(232,196,104,0.12) inset, 0 14px 32px -14px rgba(0,0,0,0.85), 0 0 0 1px rgba(232,196,104,0.18)",
        glow: "0 0 0 1px rgba(232,196,104,0.35), 0 10px 40px -10px rgba(232,196,104,0.35)",
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "4px",
        md: "10px",
        lg: "14px",
        xl: "18px",
      },
    },
  },
  plugins: [],
};
export default config;
