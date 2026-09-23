import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  const oauth = {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    github: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  };
  return (
    <Suspense fallback={<main style={{ maxWidth: 380, margin: "100px auto", padding: "0 20px" }}><div className="panel" style={{ padding: 28 }}>Loading…</div></main>}>
      <LoginForm oauth={oauth} />
    </Suspense>
  );
}
