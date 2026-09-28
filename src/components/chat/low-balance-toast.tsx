import { useEffect, useState } from "react";
import { fmt } from "@/components/payment/purchase-card";

/**
 * Low-balance banner: full-width bar at the top of the chat container,
 * shown once per session when the balance drops below the low threshold.
 * Shows the remaining time ticking down per second (resynced whenever the
 * server-fed balance updates). Text + purchase button are centered; the
 * close button sits at the end. The purchase button opens the in-chat
 * buy-credits modal (no navigation).
 */
export default function LowBalanceToast({
  balance,
  onBuy,
  onDismiss,
}: {
  /** Server-fed remaining seconds; ticks down locally between updates. */
  balance: number;
  onBuy: () => void;
  onDismiss: () => void;
}) {
  const [display, setDisplay] = useState(balance);

  // Resync when the server sends a fresh balance (heartbeat, sends, purchases).
  useEffect(() => {
    setDisplay(balance);
  }, [balance]);

  // Local per-second countdown between server updates.
  useEffect(() => {
    const t = setInterval(() => setDisplay((d) => Math.max(0, d - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="balance-banner" role="alert" aria-live="polite">
      <div className="balance-banner-spacer" />
      <div className="balance-banner-center">
        {/* Warning: filled amber triangle with an ! in the centre. */}
        <svg className="warning-icon" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M7.14 2.28a1 1 0 0 1 1.72 0l5.9 10.22a1 1 0 0 1-.86 1.5H2.1a1 1 0 0 1-.86-1.5L7.14 2.28Z" fill="#f59e0b" />
          <rect x="7.42" y="5.6" width="1.16" height="4" rx="0.58" fill="#1a1a1a" />
          <circle cx="8" cy="11.3" r="0.75" fill="#1a1a1a" />
        </svg>
        <span className="toast-text error">
          You have <span className="toast-time">{fmt(display)}</span> time remaining.
        </span>
        <button type="button" className="btn btn-primary btn-toast" onClick={onBuy}>
          Purchase more time
        </button>
      </div>
      <div className="balance-banner-end">
        <button type="button" className="modal-x" aria-label="Dismiss" onClick={onDismiss}>
          ✕
        </button>
      </div>
    </div>
  );
}