"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatSummary {
  id: string;
  title: string;
}

export default function ChatClient({ userEmail }: { userEmail: string }) {
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
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshChats = useCallback(async () => {
    const res = await fetch("/api/chats");
    if (res.ok) {
      const body = (await res.json()) as { chats: ChatSummary[] };
      setChats(body.chats);
    }
  }, []);

  useEffect(() => {
    refreshChats();
    fetch("/api/me").then((r) => r.json()).then((b) => setBalance(b.balanceSeconds ?? null)).catch(() => {});
  }, [refreshChats]);

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

  async function send(e: React.FormEvent) {
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
        const body = (await res.json().catch(() => ({}))) as { error?: string };
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

  return (
    <div className={`chat-shell${sidebarOpen ? " sidebar-open" : ""}`}>
      {/* Backdrop (mobile only): tap to dismiss the slid-in sidebar. */}
      <div className="chat-backdrop" aria-hidden="true" onClick={() => setSidebarOpen(false)} />
      {/* Sidebar */}
      <aside className="chat-sidebar">
        <div style={{ padding: 12 }}>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={newChat}>+ New chat</button>
        </div>
        <nav style={{ flex: 1, overflowY: "auto", padding: "0 8px" }}>
          {chats.map((c) => (
            <div
              key={c.id}
              className="chat-row"
              onClick={() => openChat(c.id)}
              style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: chatId === c.id ? "#2a2a2a" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
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
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  fill="currentColor"
                >
                  {/* nerd-fonts symbol: cod-trash (ea81) — SVG asset: public/icons/nf-cod-trash.svg */}
                  <path d="M14 2H10C10 0.897 9.103 0 8 0C6.897 0 6 0.897 6 2H2C1.724 2 1.5 2.224 1.5 2.5C1.5 2.776 1.724 3 2 3H2.54L3.349 12.708C3.456 13.994 4.55 15 5.84 15H10.159C11.449 15 12.543 13.993 12.65 12.708L13.459 3H13.999C14.275 3 14.499 2.776 14.499 2.5C14.499 2.224 14.275 2 13.999 2H14ZM8 1C8.551 1 9 1.449 9 2H7C7 1.449 7.449 1 8 1ZM11.655 12.625C11.591 13.396 10.934 14 10.16 14H5.841C5.067 14 4.41 13.396 4.346 12.625L3.544 3H12.458L11.656 12.625H11.655ZM7 5.5V11.5C7 11.776 6.776 12 6.5 12C6.224 12 6 11.776 6 11.5V5.5C6 5.224 6.224 5 6.5 5C6.776 5 7 5.224 7 5.5ZM10 5.5V11.5C10 11.776 9.776 12 9.5 12C9.224 12 9 11.776 9 11.5V5.5C9 5.224 9.224 5 9.5 5C9.776 5 10 5.224 10 5.5Z" />
                </svg>
              </button>
            </div>
          ))}
        </nav>
        <div style={{ padding: 12, borderTop: "1px solid var(--border)", fontSize: 13 }}>
          {/* Profile: avatar + account + balance */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "var(--accent)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 16,
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              {(userEmail[0] ?? "?").toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</div>
              <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                {/* nerd-fonts symbol: cod-watch — SVG asset: public/icons/nf-cod-watch.svg */}
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ color: "var(--muted)", flexShrink: 0 }}>
                  <path d="M12.5 6H12C12 5.282 11.61 4.627 11 4.275V2.5C11 1.673 10.327 1 9.5 1H6.5C5.673 1 5 1.673 5 2.5V4.275C4.39 4.628 4 5.283 4 6V10C4 10.718 4.39 11.373 5 11.725V13.5C5 14.327 5.673 15 6.5 15H9.5C10.327 15 11 14.327 11 13.5V11.725C11.61 11.372 12 10.717 12 10V9H12.5C12.776 9 13 8.776 13 8.5V6.5C13 6.224 12.776 6 12.5 6ZM6 2.5C6 2.224 6.225 2 6.5 2H9.5C9.775 2 10 2.224 10 2.5V4H6V2.5ZM10 13.5C10 13.776 9.775 14 9.5 14H6.5C6.225 14 6 13.776 6 13.5V12H10V13.5ZM11 10C11 10.418 10.731 10.795 10.333 10.937C10.213 10.979 10.104 11 10 11H6C5.896 11 5.787 10.979 5.667 10.937C5.269 10.795 5 10.418 5 10V6C5 5.582 5.269 5.205 5.667 5.063C5.787 5.021 5.896 5 6 5H10C10.104 5 10.213 5.021 10.333 5.063C10.731 5.205 11 5.582 11 6V10Z" />
                </svg>
                {balance !== null ? (
                  <span
                    style={{
                      color: balance > 0 ? "var(--accent)" : "var(--danger)",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "1px 8px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {balance >= 3600 ? `${(balance / 3600).toFixed(2)}h` : `${Math.floor(balance / 60)}m ${balance % 60}s`} left
                  </span>
                ) : (
                  <span className="muted">balance…</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <a href="/portal" className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Portal
              {/* nerd-fonts symbol: cod-arrow-right — SVG asset: public/icons/nf-cod-arrow-right.svg */}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M13.854 8.14576L8.854 3.14576C8.659 2.95076 8.342 2.95076 8.147 3.14576C7.952 3.34076 7.952 3.65776 8.147 3.85276L12.293 7.99876H2.5C2.224 7.99876 2 8.22276 2 8.49876C2 8.77476 2.224 8.99876 2.5 8.99876H12.293L8.147 13.1448C7.952 13.3398 7.952 13.6568 8.147 13.8518C8.245 13.9498 8.373 13.9978 8.501 13.9978C8.629 13.9978 8.757 13.9488 8.855 13.8518L13.855 8.85176C14.05 8.65676 14.05 8.33976 13.855 8.14476L13.854 8.14576Z" />
              </svg>
            </a>
            <a
              href="#"
              className="muted"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              onClick={async (e) => {
                e.preventDefault();
                await signOut({ callbackUrl: "/" });
              }}
            >
              {/* nerd-fonts symbol: cod-sign-out — SVG asset: public/icons/nf-cod-sign-out.svg */}
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M10 13.5C10 13.776 9.776 14 9.5 14H4.5C3.119 14 2 12.881 2 11.5V3.5C2 2.119 3.119 1 4.5 1H9.5C9.776 1 10 1.224 10 1.5C10 1.776 9.776 2 9.5 2H4.5C3.672 2 3 2.672 3 3.5V11.5C3 12.328 3.672 13 4.5 13H9.5C9.776 13 10 13.224 10 13.5ZM13.854 7.148L10.854 4.148C10.659 3.953 10.342 3.953 10.147 4.148C9.952 4.343 9.952 4.66 10.147 4.855L12.293 7.001H5.5C5.224 7.001 5 7.225 5 7.501C5 7.777 5.224 8.001 5.5 8.001H12.293L10.147 10.147C9.952 10.342 9.952 10.659 10.147 10.854C10.342 11.049 10.659 11.049 10.854 10.854L13.854 7.854C14.049 7.659 14.049 7.343 13.854 7.148Z" />
              </svg>
              Sign out
            </a>
          </div>
        </div>
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
          <div style={{ fontWeight: 600 }}>Chat</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 16px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 16 }}>
            {messages.length === 0 && (
              <div className="muted" style={{ textAlign: "center", marginTop: 80 }}>
                New chat — messages are metered per second of model time.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: m.role === "user" ? "#10a37722" : "var(--panel)",
                    border: "1px solid var(--border)",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.content}
                  {m.role === "assistant" && !m.content && streaming && <span className="muted">…</span>}
                </div>
              </div>
            ))}
            {status && <div className="muted" style={{ textAlign: "center" }}>⏳ {status} — first response may take a minute while the model loads…</div>}
            {error && <div className="error" style={{ textAlign: "center" }}>{error}</div>}
            <div ref={bottomRef} />
          </div>
        </div>

        <form onSubmit={send} style={{ padding: "12px 16px 20px", borderTop: "1px solid var(--border)" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", gap: 10 }}>
            <textarea
              className="input"
              rows={1}
              name="message"
              id="chat-input"
              style={{ resize: "none", maxHeight: 160 }}
              placeholder={streaming ? "Streaming…" : "Message…"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  // SAFETY: send() only calls e.preventDefault() on the parameter, which KeyboardEvent provides — no React event type is relied on beyond preventDefault().
                  void send(e as unknown as React.FormEvent);
                }
              }}
              disabled={streaming}
            />
            <button className="btn btn-primary" disabled={streaming || !input.trim()} type="submit">Send</button>
          </div>
        </form>
      </section>
    </div>
  );
}
