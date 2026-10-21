"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AuthShell } from "@/components/auth-shell";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell subtitle="Staff sign in">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5 tracking-wide">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full"
            placeholder="you@dadadosa.in"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5 tracking-wide">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p role="alert" className="text-[#FF8F7A] text-sm bg-rust/10 border border-rust/40 rounded px-3 py-2">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-muted text-xs text-center mt-6 leading-relaxed">
        New staff? <a href="/signup" className="text-gold hover:underline">Create an account</a>. An admin
        still has to assign your role and branch before you can use it.
      </p>
    </AuthShell>
  );
}
