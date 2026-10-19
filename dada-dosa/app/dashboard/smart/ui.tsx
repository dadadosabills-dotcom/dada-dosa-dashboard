import Link from "next/link";
import type { ReactNode } from "react";
import type { Change } from "@/lib/analytics/compare";
import { TONE_ARROW, TONE_BORDER, TONE_TEXT, type DisplayTone } from "@/lib/analytics/tone";

/** One headline number: plain label, big value, and how it compares. Tap to open the list behind it. */
export function Kpi({
  label, value, fullValue, change, caption, tone, href,
}: {
  label: string; value: string; fullValue?: string;
  change?: Change; caption?: string; tone?: DisplayTone; href?: string;
}) {
  const t: DisplayTone = tone ?? change?.tone ?? "flat";
  const body = (
    <>
      <p className="text-xs text-muted leading-tight">{label}</p>
      <p className="num text-2xl text-cream mt-1.5 leading-none" title={fullValue}>{value}</p>
      {change ? (
        <p className={`text-xs mt-2 leading-snug ${TONE_TEXT[t]}`}>
          <span aria-hidden="true">{TONE_ARROW[change.direction]} </span>{change.text}
        </p>
      ) : caption ? (
        <p className={`text-xs mt-2 leading-snug ${TONE_TEXT[t]}`}>{caption}</p>
      ) : null}
    </>
  );
  const cls = `card p-4 block min-h-[104px] border ${TONE_BORDER[t === "good" || t === "bad" || t === "warn" ? t : "flat"]} hover:border-gold-dim transition-colors`;
  return href ? <Link href={href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold text-cream">{children}</h2>
      {hint && <p className="text-[11px] text-muted text-right">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-panel2 ${className}`} />;
}

export function KpiSkeletons({ n = 5 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3" role="status" aria-label="Loading numbers">
      {Array.from({ length: n }, (_, i) => <Skeleton key={i} className="h-[104px]" />)}
    </div>
  );
}

export function SectionError({ what, onRetry, detail }: { what: string; onRetry?: () => void; detail?: string }) {
  return (
    <div className="card p-4 border-[#F2C14E]/40" role="alert">
      <p className="text-sm text-[#F2C14E]">Couldn&apos;t load {what}.</p>
      <p className="text-xs text-muted mt-1">Your data is safe — this is only a display problem. Check your internet and try again.</p>
      {detail && <p className="text-[11px] text-muted mt-1 break-words opacity-80">{detail}</p>}
      {onRetry && <button onClick={onRetry} className="btn-ghost mt-3 min-h-[44px]">Try again</button>}
    </div>
  );
}

/** Friendly empty state with a "what to do next" action. */
export function EmptyNote({ title, hint, href, action }: { title: string; hint: string; href?: string; action?: string }) {
  return (
    <div className="card p-5 text-center">
      <p className="text-sm text-cream">{title}</p>
      <p className="text-xs text-muted mt-1">{hint}</p>
      {href && action && <Link href={href} className="btn-primary inline-block mt-3 min-h-[44px] leading-[28px]">{action}</Link>}
    </div>
  );
}
