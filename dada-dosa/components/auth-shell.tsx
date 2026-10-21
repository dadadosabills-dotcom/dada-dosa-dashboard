import Image from "next/image";
import type { ReactNode } from "react";

/** Shared frame for sign in / sign up: the logo on a warm glow, the shop's own tagline, then the form on a raised card. */
export function AuthShell({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute -inset-6 rounded-full blur-2xl opacity-70"
              style={{ background: "radial-gradient(circle, rgba(232,196,104,0.35) 0%, rgba(194,24,91,0.18) 45%, transparent 70%)" }}
            />
            <Image
              src="/logo.png"
              alt="Dada Dosa"
              width={140}
              height={140}
              priority
              className="relative rounded-full ring-1 ring-gold/40 shadow-[0_0_0_6px_rgba(232,196,104,0.06),0_20px_50px_-15px_rgba(0,0,0,0.9)]"
            />
          </div>
          <div className="gold-rule w-40 mt-7" />
          <h1 className="text-cream text-xl font-semibold mt-4">{subtitle}</h1>
        </div>

        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
