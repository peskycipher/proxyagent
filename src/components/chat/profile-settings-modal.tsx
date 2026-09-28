import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import GitHubMark from "@/components/github-mark";
import GoogleMark from "@/components/google-mark";
import { jsonSafe } from "@/lib/error-body";

interface LinkedAccountInfo {
  provider: string;
  email: string | null;
  linkedAt: number;
}

const PROVIDER_LABELS: Record<string, string> = { google: "Google (Gmail)", github: "GitHub" };

/** The profile settings modal: picture, username, theme, linked accounts, sign out. */
export default function ProfileSettingsModal({
  userEmail,
  username,
  avatar,
  avatarSrc,
  uploading,
  onClose,
  onUploadClick,
  onSaved,
  theme,
  applyTheme,
  linked,
  linkedAvailable,
  linkedBanner,
  needPasswordFor,
  unlinkPassword,
  setUnlinkPassword,
  onUnlink,
}: {
  userEmail: string;
  username: string | null;
  avatar: string | null;
  /** Picture to render: uploaded one wins, then the linked provider's. */
  avatarSrc: string | null;
  uploading: boolean;
  onClose: () => void;
  onUploadClick: () => void;
  /** Notifies the parent after a successful username save. */
  onSaved: (username: string | null) => void;
  theme: "dark" | "light";
  applyTheme: (next: "dark" | "light") => void;
  linked: LinkedAccountInfo[];
  linkedAvailable: string[];
  linkedBanner: { ok: boolean; text: string } | null;
  /** Which provider is awaiting a password confirmation to unlink. */
  needPasswordFor: string | null;
  unlinkPassword: string;
  setUnlinkPassword: (v: string) => void;
  onUnlink: (provider: string, password?: string) => void | Promise<void>;
}) {
  // Seeds from the current value on mount (the modal only mounts when open).
  const [usernameDraft, setUsernameDraft] = useState(username ?? "");
  const [usernameMsg, setUsernameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingUsername, setSavingUsername] = useState(false);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveUsername(e: React.SubmitEvent) {
    e.preventDefault();
    if (savingUsername) return;
    setSavingUsername(true);
    try {
      const res = await fetch("/api/me/username", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: usernameDraft }),
      });
      const body = await jsonSafe<{ error?: string; username?: string | null }>(res);
      if (res.ok) {
        setUsernameMsg({ ok: true, text: "Saved." });
        // Re-fetch is unnecessary: the server echoes the stored value.
        onSaved?.(body.username ?? null);
      } else {
        setUsernameMsg({ ok: false, text: body.error ?? "failed to save username" });
      }
    } catch {
      setUsernameMsg({ ok: false, text: "failed to save username" });
    } finally {
      setSavingUsername(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Profile settings">
        <div className="modal-head">
          <div className="modal-title">Profile settings</div>
          <button type="button" className="modal-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-profile">
          <button type="button" className="avatar-btn avatar-btn-lg" title="Upload picture" onClick={onUploadClick}>
            {avatarSrc ? <img src={avatarSrc} alt="" /> : (userEmail[0] ?? "?").toUpperCase()}
          </button>
          <span className="muted">
            {uploading ? "Uploading…" : avatar ? "Click the picture to replace it" : avatarSrc ? "Using your linked account's picture" : "Click to upload a picture"}
          </span>
          <div className="modal-name">{userEmail}</div>
          {username && <span className="muted">@{username}</span>}
        </div>
        <div className="modal-grid">
          {/* Public username: editable, unique, cleared with an empty value. */}
          <div>
            <div className="field-label">Username</div>
            <form onSubmit={saveUsername} className="username-form">
              <input
                className="input input-inline"
                name="username"
                autoComplete="off"
                spellCheck={false}
                maxLength={32}
                placeholder="e.g. ada_lovelace"
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(e.target.value)}
              />
              <button className="btn btn-chip" type="submit" disabled={savingUsername}>
                {savingUsername ? "Saving…" : "Save"}
              </button>
            </form>
            <div className="hint-row">
              {usernameMsg && (
                <span className={`field-hint ${usernameMsg.ok ? "muted" : "error"}`}>{usernameMsg.text}</span>
              )}
              {!usernameMsg && (
                <span className="muted field-hint">2–32 chars; letters, digits, - and _. Empty clears it.</span>
              )}
            </div>
          </div>
          <div className="theme-row">
            <span>Theme</span>
            <div className="theme-btns">
              <button
                type="button"
                className={`btn btn-chip${theme === "light" ? " btn-primary" : ""}`}
                onClick={() => applyTheme("light")}
              >
                Light
              </button>
              <button
                type="button"
                className={`btn btn-chip${theme === "dark" ? " btn-primary" : ""}`}
                onClick={() => applyTheme("dark")}
              >
                Dark
              </button>
            </div>
          </div>
          {/* Linked accounts: Google / GitHub identities bound to this profile. */}
          <div className="linked-block">
            <div className="linked-title">Linked accounts</div>
            {linkedBanner && <div className={`linked-banner ${linkedBanner.ok ? "muted" : "error"}`}>{linkedBanner.text}</div>}
            <div className="linked-list">
              {linkedAvailable.map((p) => {
                const row = linked.find((l) => l.provider === p);
                return (
                  <div key={p} className="linked-row">
                    <div className="linked-line">
                      <span className="linked-icon">{p === "google" ? <GoogleMark size={16} /> : <GitHubMark size={16} />}</span>
                      <span className="linked-name">{PROVIDER_LABELS[p] ?? p}</span>
                      <span className="muted linked-status">
                        {row ? (row.email ? `linked: ${row.email}` : "linked") : "not linked"}
                      </span>
                      {row ? (
                        <button type="button" className="btn btn-pill" onClick={() => void onUnlink(p)}>
                          Unlink
                        </button>
                      ) : (
                        <form method="post" action={`/api/me/linked/${p}`}>
                          <button type="submit" className="btn btn-primary btn-pill">
                            Link
                          </button>
                        </form>
                      )}
                    </div>
                    {/* Last remaining sign-in method: confirm with the password. */}
                    {needPasswordFor === p && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void onUnlink(p, unlinkPassword);
                        }}
                        className="unlink-form"
                      >
                        <input
                          className="input unlink-input"
                          type="password"
                          autoComplete="current-password"
                          placeholder="Confirm password to unlink"
                          value={unlinkPassword}
                          onChange={(e) => setUnlinkPassword(e.target.value)}
                        />
                        <button className="btn btn-confirm" type="submit">
                          Confirm
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
              {linkedAvailable.length === 0 && <span className="muted">No OAuth providers are configured on this server.</span>}
            </div>
          </div>
          <button type="button" className="btn btn-block-mt" onClick={() => void signOut({ callbackUrl: "/" })}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}