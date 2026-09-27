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
  minimumTransactionCoin?: number;
  qrCode?: string | null;
  coinAmount?: number | null;
}

interface PastPurchase {
  id: string;
  coin: string;
  seconds: number;
  amountUsdCents: number;
  status: string;
  createdAt: number;
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
  const [copied, setCopied] = useState<"address" | "amount" | null>(null);
  /** Terminal settle outcome of the last active purchase: "underpaid" | "expired". */
  const [settle, setSettle] = useState<"underpaid" | "expired" | null>(null);

  const settleMessage: Record<"underpaid" | "expired", string> = {
    underpaid: "Payment received was below the purchase price, so no credits were added. A new payment address is needed to try again.",
    expired: "The payment window closed with no deposit detected. No charges were made — start a new purchase to try again.",
  };

  function copyToClipboard(value: string, which: "address" | "amount") {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500);
    });
  }

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
        if (body.status === "underpaid" || body.status === "expired") setSettle(body.status);
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
    setSettle(null);
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
    setActive({
      purchaseId: body.purchaseId,
      addressIn: body.addressIn,
      amountUsdCents: body.amountUsdCents,
      seconds: body.seconds,
      minimumTransactionCoin: body.minimumTransactionCoin,
      qrCode: body.qrCode,
      coinAmount: body.coinAmount,
    });
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {tiers.map((t) => {
            const selected = selectedHours === t.hours;
            return (
              <button
                key={t.hours}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedHours(t.hours)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "var(--bg)",
                  border: selected ? "2px solid var(--accent)" : "2px solid var(--border)",
                  cursor: "pointer",
                  font: "inherit",
                  color: "inherit",
                  textAlign: "left",
                }}
              >
                <span>
                  {t.hours}h {t.discount > 0 && <span className="muted">({Math.round((1 - t.discount) * 100)}% of base)</span>}
                </span>
                <span style={{ fontWeight: 600 }}>${(t.cents / 100).toFixed(2)}</span>
              </button>
            );
          })}
        </div>
        {coins.length > 0 && (
          <div style={{ marginTop: 16 }}>
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
                        width: 57,
                        height: 57,
                        borderRadius: "50%",
                        border: selected ? "2px solid var(--accent)" : "2px solid var(--border)",
                        background: selected ? "var(--bg)" : "transparent",
                        cursor: "pointer",
                        padding: 4,
                      }}
                    >
                      {icon ? (
                        <img src={iconUrl(icon)} alt={coinLabel(c)} width={45} height={45} />
                      ) : (
                        <span style={{ fontSize: 24, fontWeight: 700 }}>{coinLabel(c).charAt(0)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {selectedTier && (
            <button className="btn btn-primary" style={{ marginTop: 16, width: "100%" }} onClick={buy} disabled={busy || coins.length === 0}>
              {busy ? "Creating…" : `Buy ${selectedHours}h — $${(selectedTier.cents / 100).toFixed(2)} in ${coinLabel(coin)}`}
            </button>
          )}
          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

        {active && (
          <div className="panel" style={{ padding: 16, marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Send payment to:</div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              {active.qrCode && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`data:image/png;base64,${active.qrCode}`}
                  alt="Payment QR code"
                  width={240}
                  height={240}
                  style={{ borderRadius: 8, border: "1px solid var(--border)" }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ wordBreak: "break-all", fontFamily: "monospace", background: "var(--bg)", padding: 10, borderRadius: 8, flex: 1 }}>
                    {active.addressIn}
                  </div>
                  <button
                    type="button"
                    className="btn"
                    style={{
                      padding: "2px 10px",
                      fontSize: 13,
                      flexShrink: 0,
                      background: copied === "address" ? "var(--border)" : undefined,
                      color: copied === "address" ? "var(--accent)" : undefined,
                    }}
                    onClick={() => copyToClipboard(active.addressIn, "address")}
                  >
                    {copied === "address" ? "Copied!" : "Copy"}
                  </button>
                </div>
                {typeof active.coinAmount === "number" && (
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="muted">Amount to transfer:</span>
                    <code style={{ background: "var(--bg)", padding: "6px 10px", borderRadius: 8 }}>
                      ≈ {active.coinAmount.toLocaleString("en-US", { maximumFractionDigits: 8 })} {coin.toUpperCase()}
                    </code>
                    <button
                      type="button"
                      className="btn"
                      style={{
                        padding: "2px 10px",
                        fontSize: 13,
                        background: copied === "amount" ? "var(--border)" : undefined,
                        color: copied === "amount" ? "var(--accent)" : undefined,
                      }}
                      onClick={() => copyToClipboard(String(active.coinAmount), "amount")}
                    >
                      {copied === "amount" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                )}
                {typeof active.minimumTransactionCoin === "number" && (
                  <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                    {/* nerd-fonts symbol: cod-warning — SVG asset: public/icons/nf-cod-warning.svg */}
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M14.831 11.965L9.206 1.714C8.965 1.274 8.503 1 8 1C7.497 1 7.035 1.274 6.794 1.714L1.169 11.965C1.059 12.167 1 12.395 1 12.625C1 13.383 1.617 14 2.375 14H13.625C14.383 14 15 13.383 15 12.625C15 12.395 14.941 12.167 14.831 11.965ZM13.625 13H2.375C2.168 13 2 12.832 2 12.625C2 12.561 2.016 12.5 2.046 12.445L7.671 2.195C7.736 2.075 7.863 2 8 2C8.137 2 8.264 2.075 8.329 2.195L13.954 12.445C13.984 12.501 14 12.561 14 12.625C14 12.832 13.832 13 13.625 13ZM8.75 11.25C8.75 11.664 8.414 12 8 12C7.586 12 7.25 11.664 7.25 11.25C7.25 10.836 7.586 10.5 8 10.5C8.414 10.5 8.75 10.836 8.75 11.25ZM7.5 9V5.5C7.5 5.086 7.836 4.75 8.25 4.75C8.664 4.75 9 5.086 9 5.5V9C9 9.414 8.664 9.75 8.25 9.75C7.836 9.75 7.5 9.414 7.5 9Z" />
                    </svg>
                    <span>
                      Minimum transaction: <strong>{active.minimumTransactionCoin} {coin.toUpperCase()}</strong> — payments below
                      this amount are <strong>not credited and the funds are lost</strong>.
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="muted" style={{ marginTop: 8 }}>
              Price: ${(active.amountUsdCents / 100).toFixed(2)} for {fmt(active.seconds)}. Credits appear automatically
              after blockchain confirmation — this page updates on its own.
            </div>
          </div>
        )}
      </div>

      {settle && (
        <div className="panel" style={{ padding: 20, marginBottom: 20, border: "1px solid var(--danger)", display: "flex", alignItems: "flex-start", gap: 10, color: "var(--danger)" }}>
          {/* nerd-fonts symbol: cod-warning — SVG asset: public/icons/nf-cod-warning.svg */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }}>
            <path d="M14.831 11.965L9.206 1.714C8.965 1.274 8.503 1 8 1C7.497 1 7.035 1.274 6.794 1.714L1.169 11.965C1.059 12.167 1 12.395 1 12.625C1 13.383 1.617 14 2.375 14H13.625C14.383 14 15 13.383 15 12.625C15 12.395 14.941 12.167 14.831 11.965ZM13.625 13H2.375C2.168 13 2 12.832 2 12.625C2 12.561 2.016 12.5 2.046 12.445L7.671 2.195C7.736 2.075 7.863 2 8 2C8.137 2 8.264 2.075 8.329 2.195L13.954 12.445C13.984 12.501 14 12.561 14 12.625C14 12.832 13.832 13 13.625 13ZM8.75 11.25C8.75 11.664 8.414 12 8 12C7.586 12 7.25 11.664 7.25 11.25C7.25 10.836 7.586 10.5 8 10.5C8.414 10.5 8.75 10.836 8.75 11.25ZM7.5 9V5.5C7.5 5.086 7.836 4.75 8.25 4.75C8.664 4.75 9 5.086 9 5.5V9C9 9.414 8.664 9.75 8.25 9.75C7.836 9.75 7.5 9.414 7.5 9Z" />
          </svg>
          <span>
            <strong>{settle === "underpaid" ? "Payment underpaid" : "Payment expired"}</strong> — {settleMessage[settle]}
          </span>
        </div>
      )}

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
                  <td className="muted">{new Date(p.createdAt).toLocaleDateString()}</td>
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
