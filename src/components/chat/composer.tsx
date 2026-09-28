import type { KeyboardEvent, SubmitEvent } from "react";

/** The bottom message composer: textarea + Send. Enter sends, Shift+Enter newlines. */
export default function Composer({
  input,
  setInput,
  streaming,
  onSend,
}: {
  input: string;
  setInput: (v: string) => void;
  streaming: boolean;
  onSend: (e: SubmitEvent) => void | Promise<void>;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // SAFETY: onSend only calls e.preventDefault() on the parameter, which KeyboardEvent provides — no React event type is relied on beyond preventDefault().
      void onSend(e as unknown as SubmitEvent);
    }
  }

  return (
    <form onSubmit={(e) => void onSend(e)} className="chat-compose">
      <div className="chat-compose-inner">
        <textarea
          className="input chat-input"
          rows={1}
          name="message"
          id="chat-input"
          placeholder={streaming ? "Streaming…" : "Message…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={streaming}
        />
        <button className="btn btn-primary" disabled={streaming || !input.trim()} type="submit">
          Send
        </button>
      </div>
    </form>
  );
}