import { useEffect } from "react";
import PurchaseCard from "@/components/payment/purchase-card";
import type { Tier } from "@/components/payment/purchase-card";

/**
 * Buy-credits modal: the portal's payment card, rendered over the chat page
 * so the user can purchase without leaving their thread. The chat page
 * passes server-computed tiers/coins (same pricing as the portal).
 */
export default function BuyCreditsModal({
  tiers,
  coins,
  onBalanceUpdate,
  onClose,
}: {
  tiers: Tier[];
  coins: string[];
  onBalanceUpdate: (seconds: number) => void;
  onClose: () => void;
}) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Buy time credits">
        <div className="modal-card-head">
          <div className="modal-title">Buy time credits</div>
          <button type="button" className="modal-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <PurchaseCard tiers={tiers} coins={coins} onBalanceUpdate={onBalanceUpdate} />
      </div>
    </div>
  );
}