// Turns "this number vs that number" into the plain-language note and colour
// shown next to every KPI, e.g. "12% lower than same day last week".

export type Tone = "good" | "bad" | "flat" | "new";

export type Change = {
  /** Percentage change, rounded to a whole number. null when there is nothing to compare with. */
  pct: number | null;
  direction: "up" | "down" | "flat";
  tone: Tone;
  /** Plain sentence, e.g. "12% lower than same day last week". */
  text: string;
};

/**
 * @param higherIsBetter true for sales/profit, false for expenses/amount owed.
 *                       Decides whether "up" is green or red.
 */
export function compareValues(current: number, previous: number, compareLabel: string, higherIsBetter = true): Change {
  const same = Math.abs(current - previous) < 0.005;
  if (previous === 0 && current === 0) {
    return { pct: null, direction: "flat", tone: "flat", text: `No change from ${compareLabel}` };
  }
  if (previous === 0) {
    return { pct: null, direction: "up", tone: "new", text: `Nothing to compare with in ${compareLabel}` };
  }
  if (same) {
    return { pct: 0, direction: "flat", tone: "flat", text: `Same as ${compareLabel}` };
  }
  const pct = Math.round((Math.abs(current - previous) / Math.abs(previous)) * 100);
  const up = current > previous;
  // A change that rounds to 0% is "flat" rather than an alarming arrow.
  if (pct === 0) {
    return { pct: 0, direction: "flat", tone: "flat", text: `About the same as ${compareLabel}` };
  }
  const good = up === higherIsBetter;
  return {
    pct,
    direction: up ? "up" : "down",
    tone: good ? "good" : "bad",
    text: `${pct}% ${up ? "higher" : "lower"} than ${compareLabel}`,
  };
}
