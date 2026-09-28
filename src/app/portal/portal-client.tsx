"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

/** Display currencies for prices (CryptAPI-supported fiat, docs/convert.md). */
const CURRENCIES = [
  { code: "USD", symbol: "$" },
  { code: "EUR", symbol: "€" },
  { code: "GBP", symbol: "£" },
  { code: "CAD", symbol: "C$" },
  { code: "JPY", symbol: "¥" },
  { code: "AUD", symbol: "A$" },
  { code: "CHF", symbol: "CHF " },
  { code: "CNY", symbol: "CN¥" },
  { code: "INR", symbol: "₹" },
] as const;

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
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
  /** Display currency for prices; rate = how many CUR one USD buys. */
  const [currency, setCurrency] = useState<string>("USD");
  const [rate, setRate] = useState<number | null>(1);
  const ratesRef = useRef<Record<string, number | null>>({});

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

  /** Price in the selected display currency; USD fallback while loading/unavailable. */
  function fmtPrice(cents: number): string {
    if (currency === "USD" || rate === null) return `$${(cents / 100).toFixed(2)}`;
    const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "";
    return `${symbol}${(rate * (cents / 100)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }

  // Load the USD -> currency rate (per-portal cache) whenever the selection changes.
  useEffect(() => {
    if (currency === "USD") {
      setRate(1);
      return;
    }
    const cached = ratesRef.current[currency];
    if (cached !== undefined) {
      setRate(cached);
      return;
    }
    let cancelled = false;
    setRate(null); // loading: show USD until the rate lands
    fetch(`/api/fx?amount=1&to=${encodeURIComponent(currency)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { value?: number } | null) => {
        const v = b && Number.isFinite(Number(b.value)) && Number(b.value) > 0 ? Number(b.value) : null;
        ratesRef.current[currency] = v;
        if (!cancelled) setRate(v);
      })
      .catch(() => {
        ratesRef.current[currency] = null;
        if (!cancelled) setRate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currency]);

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
          <button type="button" className="btn" onClick={() => void signOut({ callbackUrl: "/" })}>Sign out</button>
        </div>
      </div>

      <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <div className="muted">Available credits</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: balance > 0 ? "var(--text)" : "var(--danger)" }}>
          {fmt(balance)}
        </div>
      </div>

      <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2 style={{ margin: 0, marginBottom: 12 }}>Buy time credits</h2>
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
                <span style={{ fontWeight: 600 }}>{fmtPrice(t.cents)}</span>
              </button>
            );
          })}
        </div>
        {CURRENCIES.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="muted" style={{ marginBottom: 4 }}>Currency</div>
            <select
              id="currency-select"
              className="input"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label="Display currency for prices"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code}</option>
              ))}
            </select>
          </div>
        )}
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
            <button type="button" className="btn btn-primary" style={{ marginTop: 16, width: "100%" }} onClick={buy} disabled={busy || coins.length === 0}>
              {busy ? "Creating…" : `Buy ${selectedHours}h — $${(selectedTier.cents / 100).toFixed(2)} in ${coinLabel(coin)}`}
            </button>
          )}
          {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}

        {active && (
          <div className="panel" style={{ padding: 16, marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Send payment to:</div>
            <div className="pay-flex">
              {active.qrCode && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`data:image/png;base64,${active.qrCode}`}
                  alt="Payment QR code"
                  width={240}
                  height={240}
                  className="qr-img"
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
                  <div className="amount-row" style={{ marginTop: 10 }}>
                    <span className="muted">Amount to transfer:</span>
                    <div className="amount-value">
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
                  </div>
                )}
                {/* Locked equivalent: the transaction's amount in the selected
                    display currency. Read-only by design — the coin amount is
                    what the customer transfers; this is its fiat value. Shares
                    the 180px label column with the row above, so both amount
                    fields start at the same left edge. */}
                <div className="amount-row" style={{ marginTop: 8 }}>
                  <span className="muted">Equivalent ({currency}):</span>
                  <div className="amount-value">
                    <input
                      className="input"
                      type="text"
                      readOnly
                      aria-readonly="true"
                      aria-label={`Transaction equivalent in ${currency}`}
                      value={fmtPrice(active.amountUsdCents)}
                      style={{ width: 150, background: "var(--bg)", color: "var(--muted)", cursor: "default" }}
                    />
                    {/* nerd-fonts symbol: cod-lock — SVG asset: public/icons/nf-cod-lock.svg */}
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0, color: "var(--muted)" }}>
                      <path d="M8 9C8.55228 9 9 9.44771 9 10C9 10.5523 8.55228 11 8 11C7.44772 11 7 10.5523 7 10C7 9.44771 7.44772 9 8 9Z" />
                      <path d="M11.5 6H12C12.5523 6 13 6.44771 13 7V12C13 12.5523 12.5523 13 12 13H4C3.44771 13 3 12.5523 3 12V7C3 6.44771 3.44772 6 4 6H4.5V5C4.5 3.61929 5.61929 2.5 7 2.5H8C9.38071 2.5 10.5 3.61929 10.5 5V6H11.5Z" fillRule="evenodd" clipRule="evenodd" opacity="0" />
                      <path d="M5 6V4.5C5 3.11929 6.11929 2 7.5 2H8.5C9.88071 2 11 3.11929 11 4.5V6H12C12.5523 6 13 6.44772 13 7V12C13 12.5523 12.5523 13 12 13H4C3.44772 13 3 12.5523 3 12V7C3 6.44772 3.44772 6 4 6H5ZM7.5 3C6.67157 3 6 3.67157 6 4.5V6H10V4.5C10 3.67157 9.32843 3 8.5 3H7.5ZM4 7V12H12V7H4ZM8 9C8.55228 9 9 9.44771 9 10C9 10.5523 8.55228 11 8 11C7.44772 11 7 10.5523 7 10C7 9.44771 7.44772 9 8 9Z" />
                    </svg>
                  </div>
                </div>
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
              Price: {fmtPrice(active.amountUsdCents)} for {fmt(active.seconds)}. Credits appear automatically
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
          <table className="purchases" style={{ width: "100%", borderCollapse: "collapse" }}>
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
