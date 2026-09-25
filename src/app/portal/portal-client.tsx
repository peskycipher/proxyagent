"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { iconFor } from "@/lib/coin-icons";
import { iconUrl } from "@/lib/icon-url";

interface Tier {
  hours: number;
  discount: number;
  cents: number;
}

interface ActivePurchase {
  purchaseId: string;
  addressIn: string;
  amountUsdCents: number;
  seconds: number;
}

interface PastPurchase {
  id: string;
  coin: string;
  seconds: number;
  amountUsdCents: number;
  status: string;
}

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Coin id -> display label: "trc20_usdt" -> "TRC20 USDT", "btc" -> "BTC". */
function coinLabel(coin: string): string {
  return coin.replace(/_/g, " ").toUpperCase();
}

export default function PortalClient({
  email,
  balanceSeconds,
  tiers,
  coins,
  purchases,
}: {
  email: string;
  balanceSeconds: number;
  tiers: Tier[];
  coins: string[];
  purchases: PastPurchase[];
}) {
  const router = useRouter();
  const [balance, setBalance] = useState(balanceSeconds);
  const [selectedHours, setSelectedHours] = useState<number>(tiers[0]?.hours ?? 1);
  const [coin, setCoin] = useState<string>(coins[0] ?? "btc");
  const [active, setActive] = useState<ActivePurchase | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedTier = useMemo(() => tiers.find((t) => t.hours === selectedHours), [tiers, selectedHours]);

  // Poll the active purchase until confirmed (CryptAPI webhook credits seconds).
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/purchases/${active.purchaseId}`);
      if (!res.ok) return;
      const body = (await res.json()) as { status: string };
      if (body.status !== "pending") {
        clearInterval(t);
        setActive(null);
        const me = await fetch("/api/me").then((r) => r.json());
        setBalance(me.balanceSeconds ?? balance);
        router.refresh();
      }
    }, 5000);
    return () => clearInterval(t);
  }, [active, router]);

  async function buy() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hours: selectedHours, coin }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? "purchase failed");
      return;
    }
    setActive({ purchaseId: body.purchaseId, addressIn: body.addressIn, amountUsdCents: body.amountUsdCents, seconds: body.seconds });
  }

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Portal</div>
          <div className="muted">{email}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn" href="/chat">Chat</a>
          <button className="btn" onClick={() => void signOut({ callbackUrl: "/" })}>Sign out</button>
        </div>
      </div>

      <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <div className="muted">Available credits</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: balance > 0 ? "var(--text)" : "var(--danger)" }}>
          {fmt(balance)}
        </div>
      </div>

      <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Buy time credits</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {tiers.map((t) => (
            <label key={t.hours} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <input type="radio" name="tier" checked={selectedHours === t.hours} onChange={() => setSelectedHours(t.hours)} />
              <span style={{ flex: 1 }}>
                {t.hours}h {t.discount > 0 && <span className="muted">({Math.round((1 - t.discount) * 100)}% of base)</span>}
              </span>
              <span style={{ fontWeight: 600 }}>${(t.cents / 100).toFixed(2)}</span>
            </label>
          ))}
          {coins.length > 0 && (
            <div>
              <div className="muted" style={{ marginBottom: 4 }}>Pay with</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {coins.map((c) => {
                  const icon = iconFor(c);
                  const selected = coin === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      title={coinLabel(c)}
                      aria-pressed={selected}
                      onClick={() => setCoin(c)}
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        border: selected ? "2px solid var(--accent)" : "2px solid var(--border)",
                        background: selected ? "var(--bg)" : "transparent",
                        cursor: "pointer",
                        padding: 4,
                      }}
                    >
                      {icon ? (
                        <img src={iconUrl(icon)} alt={coinLabel(c)} width={30} height={30} />
                      ) : (
                        <span style={{ fontSize: 16, fontWeight: 700 }}>{coinLabel(c).charAt(0)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {selectedTier && (
            <button className="btn btn-primary" onClick={buy} disabled={busy || coins.length === 0}>
              {busy ? "Creating…" : `Buy ${selectedHours}h — $${(selectedTier.cents / 100).toFixed(2)} in ${coinLabel(coin)}`}
            </button>
          )}
          {error && <div className="error">{error}</div>}
        </div>

        {active && (
          <div className="panel" style={{ padding: 16, marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Send payment to:</div>
            <div style={{ wordBreak: "break-all", fontFamily: "monospace", background: "var(--bg)", padding: 10, borderRadius: 8 }}>
              {active.addressIn}
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Price: ${(active.amountUsdCents / 100).toFixed(2)} for {fmt(active.seconds)}. Credits appear automatically
              after blockchain confirmation — this page updates on its own.
            </div>
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Recent purchases</h2>
        {purchases.length === 0 ? (
          <div className="muted">No purchases yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: "6px 0" }}>{fmt(p.seconds)}</td>
                  <td className="muted">{coinLabel(p.coin)}</td>
                  <td className="muted">{new Date().toLocaleDateString()}</td>
                  <td style={{ textAlign: "right" }}>
                    ${(p.amountUsdCents / 100).toFixed(2)}{" "}
                    <span style={{ color: p.status === "confirmed" ? "var(--accent)" : "var(--muted)" }}>({p.status})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
