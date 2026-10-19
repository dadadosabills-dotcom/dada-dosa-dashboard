"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type SmartOverviewType from "./smart-overview";
import type { StaffToday as StaffTodayType } from "./staff-today";

// Tiny entry points for the page. The real screens are downloaded only when this
// is rendered (i.e. when the `smart_overview` flag is ON), so people on the
// classic overview never download any of the new code.

function Loading({ label }: { label: string }) {
  return (
    <div className="max-w-5xl" role="status" aria-label={label}>
      <div className="animate-pulse space-y-3">
        <div className="h-4 w-24 rounded bg-panel2" />
        <div className="h-8 w-56 rounded bg-panel2" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-4">
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-[104px] rounded bg-panel2" />)}
        </div>
      </div>
    </div>
  );
}

const SmartOverviewLazy = dynamic(() => import("./smart-overview"), { ssr: false, loading: () => <Loading label="Loading your overview" /> });
const StaffTodayLazy = dynamic(() => import("./staff-today").then(m => m.StaffToday), { ssr: false, loading: () => <Loading label="Loading today's checklist" /> });

export function LazySmartOverview(props: ComponentProps<typeof SmartOverviewType>) {
  return <SmartOverviewLazy {...props} />;
}
export function LazyStaffToday(props: ComponentProps<typeof StaffTodayType>) {
  return <StaffTodayLazy {...props} />;
}
