"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full max-w-sm">
          <Image src="/logo.png" alt="Dada Dosa" width={80} height={80} className="mx-auto mb-4" />
          <p className="text-cream">Account created.</p>
          <p className="text-muted text-sm mt-2">
            An admin still needs to assign your role and branch before you can see or add entries. Check with your manager, then sign in.
          </p>
          <button onClick={() => router.push("/login")} className="btn-primary mt-6">Go to sign in</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo.png" alt="Dada Dosa" width={80} height={80} priority />
          <p className="text-muted text-sm mt-3">Create your staff account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1.5 tracking-wide">Full name</label>
            <input value={fullName} onChange={e => setFullName(e.target.value)} className="w-full" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1.5 tracking-wide">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1.5 tracking-wide">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full" required minLength={6} />
          </div>
          {error && <p className="text-rust text-sm bg-rust/10 border border-rust/30 rounded px-3 py-2">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="text-muted text-xs text-center mt-6">
          After signing up, an admin must assign your role and branch from the Admin screen before you can use the dashboard.
        </p>
      </div>
    </main>
  );
}
