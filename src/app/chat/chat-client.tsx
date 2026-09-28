"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Composer from "@/components/chat/composer";
import BuyCreditsModal from "@/components/chat/buy-credits-modal";
import LowBalanceToast from "@/components/chat/low-balance-toast";
import MessageList from "@/components/chat/message-list";
import ProfilePanel from "@/components/chat/profile-panel";
import ProfileSettingsModal from "@/components/chat/profile-settings-modal";
import type { ChatSummary, Message } from "@/components/chat/types";
import { LOW_BALANCE_SECONDS } from "@/components/chat/types";
import type { Tier } from "@/components/payment/purchase-card";
import { jsonSafe } from "@/lib/error-body";

interface LinkedAccountInfo {
  provider: string;
  email: string | null;
  linkedAt: number;
}

/** Center-crops an image file to 128x128 and returns a JPEG data URL. */
function fileToAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas unavailable");
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 128, 128);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("resize failed"));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("unreadable image"));
    };
    img.src = url;
  });
}

export default function ChatClient({
  userEmail,
  tiers,
  coins,
}: {
  userEmail: string;
  /** Server-computed pricing (same source as the portal). */
  tiers: Tier[];
  coins: string[];
}) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState("");
  /** Mobile only: whether the chat-list sidebar is slid in (CSS ≤768px). */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** Profile picture data URL (null = show the letter avatar). */
  const [avatar, setAvatar] = useState<string | null>(null);
  /** Linked-provider picture: avatar fallback when nothing was uploaded. */
  const [linkedAvatar, setLinkedAvatar] = useState<string | null>(null);
  /** Avatar dropdown menu + profile settings modal. */
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Linked OAuth accounts + which providers are configured on the server. */
  const [linked, setLinked] = useState<LinkedAccountInfo[]>([]);
  const [linkedAvailable, setLinkedAvailable] = useState<string[]>([]);
  const [linkedBanner, setLinkedBanner] = useState<{ ok: boolean; text: string } | null>(null);
  /** Unlink-last-method flow: which provider wants a password confirmation. */
  const [needPasswordFor, setNeedPasswordFor] = useState<string | null>(null);
  const [unlinkPassword, setUnlinkPassword] = useState("");
  /** Public username: current value, edited inside the modal. */
  const [username, setUsername] = useState<string | null>(null);
  /** Low-balance toast: shown once per session until dismissed. */
  const [lowToastDismissed, setLowToastDismissed] = useState(false);
  /** Buy-credits modal (opens from the countdown section). */
  const [buyOpen, setBuyOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const refreshChats = useCallback(async () => {
    const res = await fetch("/api/chats");
    if (res.ok) {
      const body = (await res.json()) as { chats: ChatSummary[] };
      setChats(body.chats);
    }
  }, []);

  useEffect(() => {
    refreshChats();
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((b: { balanceSeconds?: number; avatar?: string | null; username?: string | null; linkedAvatar?: string | null }) => {
        setBalance(b.balanceSeconds ?? null);
        setAvatar(b.avatar ?? null);
        setUsername(b.username ?? null);
        setLinkedAvatar(b.linkedAvatar ?? null);
      })
      .catch(() => {});
  }, [refreshChats]);

  const refreshLinked = useCallback(async () => {
    try {
      const res = await fetch("/api/me/linked");
      if (!res.ok) return;
      const body = await jsonSafe<{ accounts?: LinkedAccountInfo[]; available?: string[] }>(res);
      setLinked(body.accounts ?? []);
      setLinkedAvailable(body.available ?? []);
    } catch {
      // transient — the modal re-fetches on next open
    }
  }, []);

  // Theme: apply the persisted choice on mount; toggle applies it immediately.
  useEffect(() => {
    const saved = localStorage.getItem("theme") === "light" ? "light" : "dark";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  function applyTheme(next: "dark" | "light") {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // private mode / storage disabled — theme still applies for this page
    }
  }

  // Close the avatar menu on outside clicks and Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".profile-block")) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Re-entry after the OAuth link round-trip (/chat?linked=1|error&reason=…):
  // surface the result in the (auto-opened) modal, then strip the query param.
  useEffect(() => {
    void refreshLinked();
    const params = new URLSearchParams(window.location.search);
    const linkedParam = params.get("linked");
    if (!linkedParam) return;
    const reason = params.get("reason") ?? "";
    const banners: Record<string, string> = {
      unverified: "Couldn't link: the provider email isn't verified.",
      "in-use": "Couldn't link: that account is already linked to another profile.",
      session: "Couldn't link: your session expired — sign in and try again.",
    };
    if (linkedParam === "1") setLinkedBanner({ ok: true, text: "Account linked." });
    else setLinkedBanner({ ok: false, text: banners[reason] ?? "Couldn't link that account." });
    setSettingsOpen(true);
    params.delete("linked");
    params.delete("reason");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/chat?${qs}` : "/chat");
  }, [refreshLinked]);

  async function unlinkProvider(provider: string, password?: string) {
    try {
      const res = await fetch(`/api/me/linked/${provider}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setNeedPasswordFor(null);
        setUnlinkPassword("");
        setLinkedBanner(null);
        void refreshLinked();
      } else {
        const body = await jsonSafe<{ error?: string }>(res);
        if (res.status === 400 && /password/.test(body.error ?? "")) {
          setNeedPasswordFor(provider);
        } else {
          setLinkedBanner({ ok: false, text: body.error ?? "Failed to unlink." });
        }
      }
    } catch {
      setLinkedBanner({ ok: false, text: "Failed to unlink." });
    }
  }

  async function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      const res = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      if (res.ok) {
        setAvatar(dataUrl);
        setLinkedAvatar(null); // the upload now takes precedence
      } else setError("failed to upload picture");
    } catch {
      setError("failed to upload picture");
    } finally {
      setUploading(false);
    }
  }

  async function removeAvatar() {
    try {
      const res = await fetch("/api/me/avatar", { method: "DELETE" });
      if (res.ok) {
        setAvatar(null);
        setMenuOpen(false);
        // Refresh the avatar fallback: /api/me only returns linkedAvatar when
        // no upload exists, so the mount-time value may be stale.
        const me = await fetch("/api/me");
        if (me.ok) {
          const body = await jsonSafe<{ linkedAvatar?: string | null }>(me);
          setLinkedAvatar(body.linkedAvatar ?? null);
        }
      }
    } catch {
      setError("failed to remove picture");
    }
  }

  // Page-open metering: heartbeat /api/chat-presence every 10s; the server
  // bills elapsed wall-clock seconds from its own DB clock. A 402 (balance
  // spent) stops the heartbeat and returns the user to the portal to buy time.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      if (document.visibilityState === "hidden") return; // catch-up cap covers it
      try {
        const res = await fetch("/api/chat-presence", { method: "POST" });
        const body = await jsonSafe<{ balanceSeconds?: number }>(res);
        if (res.status === 402 || (typeof body.balanceSeconds === "number" && body.balanceSeconds === 0)) {
          stopped = true;
          if (timer) clearInterval(timer);
          router.push("/portal");
          return;
        }
        if (typeof body.balanceSeconds === "number") setBalance(body.balanceSeconds);
      } catch {
        // transient network failure — the next tick retries
      }
    };
    void tick(); // immediate: seeds the server clock and redirects 0-balance users
    timer = setInterval(() => void tick(), 10_000);
    const onUnload = () => {
      if (!stopped) navigator.sendBeacon?.("/api/chat-presence");
    };
    window.addEventListener("pagehide", onUnload);
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("pagehide", onUnload);
    };
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  async function openChat(id: string) {
    setChatId(id);
    setStreaming(false);
    setStatus(null);
    setSidebarOpen(false);
    const res = await fetch(`/api/chats/${id}`);
    if (res.ok) {
      const body = (await res.json()) as { messages: Message[] };
      setMessages(body.messages);
    }
  }

  function newChat() {
    setChatId(null);
    setMessages([]);
    setError("");
    setSidebarOpen(false);
  }

  async function deleteChat(id: string) {
    // Avoid racing an in-flight stream that still writes messages to this chat.
    // No confirmation: clicking the trash icon deletes the thread immediately.
    // (The button itself is disabled while a stream is in flight, so no other
    // guard is needed here.)
    if (streaming) return;
    const res = await fetch(`/api/chats/${id}`, { method: "DELETE" });
    if (res.ok) {
      setChats((c) => c.filter((x) => x.id !== id));
      if (chatId === id) {
        setChatId(null);
        setMessages([]);
        setStatus(null);
      }
    } else {
      setError("failed to delete chat");
    }
  }

  async function send(e: React.SubmitEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId: chatId ?? undefined, message: text }),
      });
      if (!res.ok || !res.body) {
        const body = await jsonSafe<{ error?: string }>(res);
        setError(body.error ?? `request failed (${res.status})`);
        setStreaming(false);
        setMessages((m) => m.filter((_, i) => i < m.length - 1));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const evLines = ev.split("\n");
          const evName = evLines.find((l) => l.startsWith("event: "))?.slice(7);
          const dataLine = evLines.find((l) => l.startsWith("data: "))?.slice(6);
          if (!evName || !dataLine) continue;
          const data = JSON.parse(dataLine) as Record<string, unknown>;
          if (evName === "token") {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { role: "assistant", content: copy[copy.length - 1].content + String(data.text ?? "") };
              return copy;
            });
          } else if (evName === "status") {
            const s = String(data.status ?? "");
            setStatus(s === "ready" ? null : s.replace("_", " "));
          } else if (evName === "chat_meta") {
            setChatId(String(data.chatId));
          } else if (evName === "done") {
            if (typeof data.balanceSeconds === "number") setBalance(data.balanceSeconds);
            refreshChats();
          } else if (evName === "error") {
            setError(String(data.message ?? "stream error"));
          }
        }
      }
    } catch {
      setError("connection lost");
    } finally {
      setStreaming(false);
      setStatus(null);
    }
  }

  /** Which picture to render: uploaded one wins, then the linked provider's. */
  const avatarSrc = avatar ?? linkedAvatar;

  return (
    <div className={`chat-shell${sidebarOpen ? " sidebar-open" : ""}`}>
      {/* Backdrop (mobile only): tap to dismiss the slid-in sidebar. */}
      <div className="chat-backdrop" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
      {/* Sidebar */}
      <aside className="chat-sidebar">
        <div className="sidebar-head">
          <button className="btn btn-primary btn-block" onClick={newChat}>+ New chat</button>
        </div>
        <nav className="chat-list">
          {chats.map((c) => (
            <div key={c.id} className={`chat-row${chatId === c.id ? " active" : ""}`} onClick={() => openChat(c.id)}>
              <span className="ellipsis">{c.title}</span>
              <button
                type="button"
                className="chat-row-del"
                title="Delete chat"
                aria-label={`Delete chat ${c.title}`}
                disabled={streaming}
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteChat(c.id);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
                  {/* nerd-fonts symbol: cod-trash (ea81) — SVG asset: public/icons/nf-cod-trash.svg */}
                  <path d="M14 2H10C10 0.897 9.103 0 8 0C6.897 0 6 0.897 6 2H2C1.724 2 1.5 2.224 1.5 2.5C1.5 2.776 1.724 3 2 3H2.54L3.349 12.708C3.456 13.994 4.55 15 5.84 15H10.159C11.449 15 12.543 13.993 12.65 12.708L13.459 3H13.999C14.275 3 14.499 2.776 14.499 2.5C14.499 2.224 14.275 2 13.999 2H14ZM8 1C8.551 1 9 1.449 9 2H7C7 1.449 7.449 1 8 1ZM11.655 12.625C11.591 13.396 10.934 14 10.16 14H5.841C5.067 14 4.41 13.396 4.346 12.625L3.544 3H12.458L11.656 12.625H11.655ZM7 5.5V11.5C7 11.776 6.776 12 6.5 12C6.224 12 6 11.776 6 11.5V5.5C6 5.224 6.224 6 6.5 5C6.776 5 7 5.224 7 5.5ZM10 5.5V11.5C10 11.776 9.776 12 9.5 12C9.224 12 9 11.776 9 11.5V5.5C9 5.224 9.224 5 9.5 5C9.776 5 10 5.224 9.5 5C9.776 5 10 5.224 9.5 5C9.776 5 10 5.224 9.5 5C9.224 5 9 5.224 9 5.5Z" />
                </svg>
              </button>
            </div>
          ))}
        </nav>
        <ProfilePanel
          userEmail={userEmail}
          avatar={avatar}
          avatarSrc={avatarSrc}
          balance={balance}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          theme={theme}
          applyTheme={applyTheme}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenBuy={() => setBuyOpen(true)}
          fileInputRef={fileInputRef}
          onUploadFile={(e) => void onAvatarFile(e)}
          onRemoveAvatar={() => void removeAvatar()}
        />
      </aside>

      {/* Chat column */}
      <section className="chat-main">
        <div className="chat-topbar">
          <button
            type="button"
            className="chat-toggle"
            aria-label="Toggle chat list"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen((o) => !o)}
          >
            {/* nerd-fonts symbol: cod-menu — SVG asset: public/icons/nf-cod-menu.svg */}
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
              <path d="M1.5 3h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1 0-1Zm0 4.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1 0-1Zm0 4.5h13a.5.5 0 0 1 0 1h-13a.5.5 0 0 1 0-1Z" />
            </svg>
          </button>
          <div className="chat-topbar-title">Chat</div>
        </div>
        {/* Low-balance banner: top of the chat container, full width. */}
        {balance !== null && balance < LOW_BALANCE_SECONDS && !lowToastDismissed && (
          <LowBalanceToast balance={balance} onBuy={() => setBuyOpen(true)} onDismiss={() => setLowToastDismissed(true)} />
        )}
        <MessageList messages={messages} status={status} error={error} streaming={streaming} bottomRef={bottomRef} />
        <Composer input={input} setInput={setInput} streaming={streaming} onSend={send} />
      </section>

      {/* Buy-credits modal: purchase without leaving the chat thread. */}
      {buyOpen && (
        <BuyCreditsModal
          tiers={tiers}
          coins={coins}
          onBalanceUpdate={(s) => setBalance(s)}
          onClose={() => setBuyOpen(false)}
        />
      )}

      {/* Profile settings modal */}
      {settingsOpen && (
        <ProfileSettingsModal
          userEmail={userEmail}
          username={username}
          avatar={avatar}
          avatarSrc={avatarSrc}
          uploading={uploading}
          onClose={() => setSettingsOpen(false)}
          onUploadClick={() => fileInputRef.current?.click()}
          onSaved={(u) => setUsername(u)}
          theme={theme}
          applyTheme={applyTheme}
          linked={linked}
          linkedAvailable={linkedAvailable}
          linkedBanner={linkedBanner}
          needPasswordFor={needPasswordFor}
          unlinkPassword={unlinkPassword}
          setUnlinkPassword={setUnlinkPassword}
          onUnlink={unlinkProvider}
        />
      )}
    </div>
  );
}