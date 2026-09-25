import btcIcon from "cryptocurrency-icons/svg/color/btc.svg";
import zecIcon from "cryptocurrency-icons/svg/color/zec.svg";
import usdtIcon from "cryptocurrency-icons/svg/color/usdt.svg";
import ltcIcon from "cryptocurrency-icons/svg/color/ltc.svg";
import ethIcon from "cryptocurrency-icons/svg/color/eth.svg";
import dogeIcon from "cryptocurrency-icons/svg/color/doge.svg";
import xmrIcon from "cryptocurrency-icons/svg/color/xmr.svg";
import solIcon from "cryptocurrency-icons/svg/color/sol.svg";
import usdtTrc20Icon from "../app/portal/icons/usdt-trc20.svg"; // TRON-red USDT for the TRC-20 network
import { type IconAsset } from "@/lib/icon-url";

/**
 * Icon map keyed by base ticker (last path segment of the CryptAPI ticker;
 * e.g. `trc20_usdt` -> `usdt`). Every coin accepted via CRYPTAPI_WALLETS_<TICKER>
 * must resolve here — tests enforce the coverage so a newly added env coin
 * cannot silently render without an icon.
 */
const ICONS: Record<string, IconAsset> = {
  btc: btcIcon,
  zec: zecIcon,
  usdt: usdtIcon,
  trc20_usdt: usdtTrc20Icon,
  ltc: ltcIcon,
  eth: ethIcon,
  doge: dogeIcon,
  xmr: xmrIcon,
  sol: solIcon,
};

export function iconFor(coin: string): IconAsset | undefined {
  return ICONS[coin] ?? ICONS[coin.split("_").pop() ?? ""];
}