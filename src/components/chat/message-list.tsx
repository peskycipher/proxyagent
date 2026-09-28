import type { RefObject } from "react";
import type { Message } from "./types";

/** The scrolling transcript: empty state, bubbles, status/error notes. */
export default function MessageList({
  messages,
  status,
  error,
  streaming,
  bottomRef,
}: {
  messages: Message[];
  status: string | null;
  error: string;
  streaming: boolean;
  bottomRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="chat-scroll">
      <div className="message-col">
        {messages.length === 0 && (
          <div className="muted msg-empty">New chat — messages are metered per second of model time.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg-row${m.role === "user" ? " user" : ""}`}>
            <div className={`msg-bubble${m.role === "user" ? " user" : ""}`}>
              {m.content}
              {m.role === "assistant" && !m.content && streaming && <span className="muted">…</span>}
            </div>
          </div>
        ))}
        {status && <div className="muted msg-note">⏳ {status} — first response may take a minute while the model loads…</div>}
        {error && <div className="error msg-note">{error}</div>}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}