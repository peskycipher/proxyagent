"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import GitHubMark from "@/components/github-mark";
import GoogleMark from "@/components/google-mark";
import Turnstile from "@/components/turnstile";

export default function SignupForm({
  oauth,
  turnstileSiteKey,
}: {
  oauth: { google: boolean; github: boolean };
  turnstileSiteKey: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [resetSignal, setResetSignal] = useState(0);
  const tokenRef = useRef("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const captchaRequired = Boolean(turnstileSiteKey);
  const captchaOk = !captchaRequired || Boolean(captchaToken);

  function takeToken() {
    const t = tokenRef.current;
    tokenRef.current = "";
    setCaptchaToken("");
    return t;
  }

  /** Wait for a fresh solve after the previous token was consumed. */
  function awaitFreshToken(ms: number): Promise<string> {
    if (tokenRef.current) return Promise.resolve(tokenRef.current);
    setResetSignal((n) => n + 1);
    return new Promise((resolve) => {
      const started = Date.now();
      const iv = setInterval(() => {
        if (tokenRef.current) {
          clearInterval(iv);
          resolve(tokenRef.current);
        } else if (Date.now() - started > ms) {
          clearInterval(iv);
          resolve("");
        }
      }, 150);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaOk) {
      setError("Please complete the captcha.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, ...(captchaToken ? { turnstileToken: takeToken() } : {}) }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Signup failed");
      setBusy(false);
      return;
    }
    // Auto sign-in. The signup token was consumed by siteverify above, so when
    // captcha is on, mint a fresh one (widget reset) before signing in.
    let signInToken = "";
    if (captchaRequired) {
      signInToken = await awaitFreshToken(10000);
      if (!signInToken) {
        // Couldn't get a fresh solve in time — finish at /login (its widget is
        // fresh anyway).
        router.push("/login");
        return;
      }
    }
    const signInRes = await signIn("credentials", {
      email,
      password,
      ...(signInToken ? { turnstileToken: signInToken } : {}),
      redirect: false,
    });
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
        {(oauth.google || oauth.github) && (
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {oauth.google && (
              <button
                className="btn"
                type="button"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onClick={() => signIn("google", { callbackUrl: "/portal" })}
              >
                <GoogleMark />
                Continue with Google
              </button>
            )}
            {oauth.github && (
              <button
                className="btn"
                type="button"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onClick={() => signIn("github", { callbackUrl: "/portal" })}
              >
                <GitHubMark />
                Continue with GitHub
              </button>
            )}
            <div className="muted" style={{ textAlign: "center", fontSize: 13 }}>or</div>
          </div>
        )}
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <input className="input" type="email" placeholder="Email" name="email" id="signup-email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password (min 8 chars)" name="password" id="signup-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          <Turnstile
            siteKey={turnstileSiteKey}
            action="signup"
            resetSignal={resetSignal}
            onToken={(t) => {
              tokenRef.current = t;
              setCaptchaToken(t);
            }}
          />
          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary" disabled={busy || !captchaOk} type="submit">{busy ? "Creating…" : "Create account"}</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          Already registered? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
