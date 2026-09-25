import Link from "next/link";
import { TIERS, priceUsdCents } from "@/lib/pricing";

export default function Home() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "80px 24px" }}>
      <h1 style={{ fontSize: 40, marginBottom: 8 }}>Uncensored AI chat</h1>
      <p className="muted" style={{ fontSize: 18, marginBottom: 40 }}>
        Your model. Your conversation. Metered to the second, prepaid in crypto.
      </p>

      <div style={{ display: "flex", gap: 12, marginBottom: 56 }}>
        <Link className="btn btn-primary" href="/login">Log in</Link>
        <Link className="btn" href="/signup">Create account</Link>
      </div>

      <div className="panel" style={{ padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>Prepaid time credits — $1.06/h</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {TIERS.map((t) => (
              <tr key={t.hours}>
                <td style={{ padding: "8px 0" }}>{t.hours} hour{t.hours > 1 ? "s" : ""}</td>
                <td className="muted">{t.discount > 0 ? `${Math.round((1 - t.discount) * 100)}% of base` : "full price"}</td>
                <td style={{ textAlign: "right", fontWeight: 600 }}>
                  ${(priceUsdCents(t.hours) / 100).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 16 }}>
          Credits decrement with actual usage (per second of model time). Paid in crypto.
        </p>
      </div>

      <p className="muted" style={{ marginTop: 24, fontSize: 14 }}>
        <Link href="/privacy">Privacy Policy</Link>
        <span style={{ margin: "0 8px" }}>·</span>
        <Link href="/terms">Terms of Service</Link>
      </p>
    </main>
  );
}
