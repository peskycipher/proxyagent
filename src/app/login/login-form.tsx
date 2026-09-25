"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import GitHubMark from "@/components/github-mark";
import Turnstile from "@/components/turnstile";

const OAUTH_ERRORS: Record<string, string> = {
  OAuthSignin: "Could not start the sign-in provider. Try again.",
  OAuthCallback: "The provider returned an error. Try again.",
  AccessDenied: "Sign-in was canceled or denied at the provider. If this was a mistake, try again.",
  OAuthAccountNotLinked: "That email is already registered with a different sign-in method.",
  OAuthEmailNotVerified:
    "Sign-in blocked: the email on your provider account isn't verified, so it can't be " +
    "linked to an existing account or create one. Verify it with the provider, or sign in " +
    "with your email and password.",
  Callback: "Sign-in failed. Try again.",
};

export default function LoginForm({
  oauth,
  turnstileSiteKey,
}: {
  oauth: { google: boolean; github: boolean };
  turnstileSiteKey: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const oauthError = OAUTH_ERRORS[params.get("error") ?? ""];
  const captchaRequired = Boolean(turnstileSiteKey);
  const captchaOk = !captchaRequired || Boolean(captchaToken);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!captchaOk) {
      setError("Please complete the captcha.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      ...(captchaToken ? { turnstileToken: captchaToken } : {}),
      redirect: false,
    });
    if (res?.error) {
      setError("Invalid email or password");
      setBusy(false);
      return;
    }
    router.push(params.get("next") || "/portal");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 380, margin: "100px auto", padding: "0 20px" }}>
      <div className="panel" style={{ padding: 28 }}>
        <h1 style={{ marginTop: 0 }}>Log in</h1>
        {oauthError && <div className="error">{oauthError}</div>}
        {(oauth.google || oauth.github) && (
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {oauth.google && (
              <button className="btn" type="button" onClick={() => signIn("google", { callbackUrl: params.get("next") || "/portal" })}>
                Continue with Google
              </button>
            )}
            {oauth.github && (
              <button
                className="btn"
                type="button"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                onClick={() => signIn("github", { callbackUrl: params.get("next") || "/portal" })}
              >
                <GitHubMark />
                Continue with GitHub
              </button>
            )}
            <div className="muted" style={{ textAlign: "center", fontSize: 13 }}>or</div>
          </div>
        )}
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Turnstile siteKey={turnstileSiteKey} action="login" onToken={setCaptchaToken} />
          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary" disabled={busy || !captchaOk} type="submit">{busy ? "Logging in…" : "Log in"}</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>
          No account? <Link href="/signup">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
