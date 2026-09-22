"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Signup failed");
      setBusy(false);
      return;
    }
    // auto sign-in
    const signInRes = await (await import("next-auth/react")).signIn("credentials", { email, password, redirect: false });
    if (signInRes?.error) {
      router.push("/login");
      return;
    }
    router.push("/portal");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 380, margin: "100px auto", padding: "0 20px" }}>
      <div className="panel" style={{ padding: 28 }}>
        <h1 style={{ marginTop: 0 }}>Create account</h1>
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password (min 8 chars)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary" disabled={busy} type="submit">{busy ? "Creating…" : "Create account"}</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          Already registered? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}