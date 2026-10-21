import type { Tone } from "./compare";

// Colour carries meaning only: green = good, red = bad, amber = needs attention.
// These tones are brighter than the app's base green/red so small text passes
// WCAG AA (8:1 or better on the dark panels; the base green/red are ~3.5:1).
// Meaning is never colour-only: every tone also has an arrow or a word.

export type DisplayTone = Tone | "warn";

export const TONE_TEXT: Record<DisplayTone, string> = {
  good: "text-[#7CC47F]",
  bad: "text-[#FF8F7A]",
  warn: "text-[#F2C14E]",
  flat: "text-muted",
  new: "text-muted",
};

export const TONE_BORDER: Record<DisplayTone, string> = {
  good: "border-[#7CC47F]/40",
  bad: "border-[#FF8F7A]/50",
  warn: "border-[#F2C14E]/50",
  flat: "border-line",
  new: "border-line",
};

// Thin coloured edge on KPI cards; the arrow and wording still carry the meaning.
export const TONE_BAR: Record<DisplayTone, string> = {
  good: "before:bg-[#7CC47F]",
  bad: "before:bg-[#FF8F7A]",
  warn: "before:bg-[#F2C14E]",
  flat: "before:bg-gold/40",
  new: "before:bg-gold/40",
};

export const TONE_ARROW: Record<"up" | "down" | "flat", string> = { up: "▲", down: "▼", flat: "■" };

// Neutral, non-semantic colours for category shares (never red/green).
export const SHARE_COLORS = ["#E8C468", "#8FB3E0", "#C4A3D9", "#9A9284", "#D98E5B"];
