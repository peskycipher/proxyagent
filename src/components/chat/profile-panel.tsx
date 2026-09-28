import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import type { RefObject } from "react";

/** Renders a seconds balance as a full h/m/s breakdown, e.g. "1h 23m 45s". */
function formatBalance(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h}h ${m}m ${s}s`;
}

/**
 * Sidebar footer: avatar (opens the menu) + account + balance chip +
 * Portal/Sign-out buttons + the avatar dropdown menu.
 */
export default function ProfilePanel({
  userEmail,
  avatar,
  avatarSrc,
  balance,
  menuOpen,
  setMenuOpen,
  theme,
  applyTheme,
  onOpenSettings,
  fileInputRef,
  onUploadFile,
  onRemoveAvatar,
}: {
  userEmail: string;
  avatar: string | null;
  /** Picture to render: uploaded one wins, then the linked provider's. */
  avatarSrc: string | null;
  balance: number | null;
  menuOpen: boolean;
  setMenuOpen: (updater: (o: boolean) => boolean) => void;
  theme: "dark" | "light";
  applyTheme: (next: "dark" | "light") => void;
  onOpenSettings: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onUploadFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAvatar: () => void;
}) {
  const router = useRouter();

  return (
    <>
      {/* Countdown: time remaining, in its own section above the profile block. */}
      <section className="countdown-section">
        {/* nerd-fonts symbol: cod-watch — SVG asset: public/icons/nf-cod-watch.svg */}
        <svg className="countdown-icon" width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M12.5 6H12C12 5.282 11.61 4.627 11 4.275V2.5C11 1.673 10.327 1 9.5 1H6.5C5.673 1 5 1.673 5 2.5V4.275C4.39 4.628 4 5.283 4 6V10C4 10.718 4.39 11.373 5 11.725V13.5C5 14.327 5.673 15 6.5 15H9.5C10.327 15 11 14.327 11 13.5V11.725C11.61 11.372 12 10.717 12 10V9H12.5C12.776 9 13 8.776 13 8.5V6.5C13 6.224 12.776 6 12.5 6ZM6 2.5C6 2.224 6.225 2 6.5 2H9.5C9.775 2 10 2.224 10 2.5V4H6V2.5ZM10 13.5C10 13.776 9.775 14 9.5 14H6.5C6.225 14 6 13.776 6 13.5V12H10V13.5ZM11 10C11 10.418 10.731 10.795 10.333 10.937C10.213 10.979 10.104 11 10 11H6C5.896 11 5.787 10.979 5.667 10.937C5.269 10.795 5 10.418 5 10V6C5 5.582 5.269 5.205 5.667 5.063C5.787 5.021 5.896 5 6 5H10C10.104 5 10.213 5.021 10.333 5.063C10.731 5.205 11 5.582 11 6V10Z" />
        </svg>
        <div className="countdown-info">
          <div className="countdown-label">Time left</div>
          {balance === null ? (
            <div className="countdown-time muted">balance…</div>
          ) : (
            <div className={`countdown-time${balance > 0 ? "" : " spent"}`}>{formatBalance(balance)}</div>
          )}
        </div>
      </section>
      <div className="profile-block">
      {/* Hidden once per sidebar; triggered from the avatar menu and the modal. */}
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onUploadFile} />
      {/* Profile: avatar (opens the menu) + account + balance */}
      <div className="profile-line">
        <button
          type="button"
          className="avatar-btn avatar-btn-sm"
          title="Open profile menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {avatarSrc ? <img src={avatarSrc} alt="" /> : (userEmail[0] ?? "?").toUpperCase()}
        </button>
        <div className="profile-info">
          <div className="ellipsis">{userEmail}</div>
        </div>
      </div>
      <div className="profile-actions">
        <button type="button" className="btn btn-inline" onClick={() => router.push("/portal")}>
          Portal
          {/* nerd-fonts symbol: cod-arrow-right — SVG asset: public/icons/nf-cod-arrow-right.svg */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M13.854 8.14576L8.854 3.14576C8.659 2.95076 8.342 2.95076 8.147 3.14576C7.952 3.34076 7.952 3.65776 8.147 3.85276L12.293 7.99876H2.5C2.224 7.99876 2 8.22276 2 8.49876C2 8.77476 2.224 8.99876 2.5 8.99876H12.293L8.147 13.1448C7.952 13.3398 7.952 13.6568 8.147 13.8518C8.245 13.9498 8.373 13.9978 8.501 13.9978C8.629 13.9978 8.757 13.9488 8.855 13.8518L13.855 8.85176C14.05 8.65676 14.05 8.33976 13.855 8.14476L13.854 8.14576Z" />
          </svg>
        </button>
        <button type="button" className="btn btn-inline" onClick={() => void signOut({ callbackUrl: "/" })}>
          {/* nerd-fonts symbol: cod-sign-out — SVG asset: public/icons/nf-cod-sign-out.svg */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M10 13.5C10 13.776 9.776 14 9.5 14H4.5C3.119 14 2 12.881 2 11.5V3.5C2 2.119 3.119 1 4.5 1H9.5C9.776 1 10 1.224 10 1.5C10 1.776 9.776 2 9.5 2H4.5C3.672 2 3 2.672 3 3.5V11.5C3 12.328 3.672 13 4.5 13H9.5C9.776 13 10 13.224 10 13.5ZM13.854 7.148L10.854 4.148C10.659 3.953 10.342 3.953 10.147 4.148C9.952 4.343 9.952 4.66 10.147 4.855L12.293 7.001H5.5C5.224 7.001 5 7.225 5 7.501C5 7.777 5.224 8.001 5.5 8.001H12.293L10.147 10.147C9.952 10.342 9.952 10.659 10.147 10.854C10.342 11.049 10.659 11.049 10.854 10.854L13.854 7.854C14.049 7.659 14.049 7.343 13.854 7.148Z" />
          </svg>
          Sign out
        </button>
      </div>
      {/* Avatar dropdown menu (opens upward, above the profile block). */}
      {menuOpen && (
        <div className="avatar-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(() => false);
              fileInputRef.current?.click();
            }}
          >
            Upload picture…
          </button>
          {avatar && (
            <button type="button" role="menuitem" onClick={onRemoveAvatar}>
              Remove picture
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(() => false);
              router.push("/portal");
            }}
          >
            Purchase more time
          </button>
          <button type="button" role="menuitem" onClick={() => applyTheme(theme === "dark" ? "light" : "dark")}>
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMenuOpen(() => false);
              onOpenSettings();
            }}
          >
            Profile settings
          </button>
        </div>
      )}
      </div>
    </>
  );
}