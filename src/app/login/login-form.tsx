import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 380, margin: "100px auto", padding: "0 20px" }}><div className="panel" style={{ padding: 28 }}>Loading…</div></main>}>
      <LoginForm />
    </Suspense>
  );
}