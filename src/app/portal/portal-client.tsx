"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import PurchaseCard, { fmt, type Tier } from "@/components/payment/purchase-card";

interface PastPurchase {
  id: string;
  coin: string;
  seconds: number;
  amountUsdCents: number;
  status: string;
  createdAt: number;
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
  const [balance, setBalance] = useState(balanceSeconds);

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>Portal</div>
          <div className="muted">{email}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {balance > 1 ? (
            <a className="btn btn-chat" href="/chat">Chat</a>
          ) : (
            <button type="button" className="btn btn-chat" disabled title="No credits — buy time below">Chat</button>
          )}
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
        <PurchaseCard tiers={tiers} coins={coins} onBalanceUpdate={setBalance} />
      </div>

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