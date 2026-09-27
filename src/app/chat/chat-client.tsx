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
  }

  async function deleteChat(id: string) {
    // Avoid racing an in-flight stream that still writes messages to this chat.
    if (streaming || !window.confirm("Delete this chat? This cannot be undone.")) return;
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
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <aside style={{ width: 240, background: "var(--panel)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
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
          <div className="muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userEmail}</div>
          <div style={{ marginTop: 4 }}>
            {balance !== null ? (
              <span style={{ color: balance > 0 ? "var(--accent)" : "var(--danger)" }}>
                {balance >= 3600 ? `${(balance / 3600).toFixed(2)}h` : `${Math.floor(balance / 60)}m ${balance % 60}s`} left
              </span>
            ) : (
              <span className="muted">balance…</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <a href="/portal" className="muted">Portal</a>
            <a
              href="#"
              className="muted"
              onClick={async (e) => {
                e.preventDefault();
                await signOut({ callbackUrl: "/" });
              }}
            >
              Sign out
            </a>
          </div>
        </div>
      </aside>

      {/* Chat column */}
      <section style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
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
