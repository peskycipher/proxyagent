/**
 * Model-context budgeting for chat history.
 *
 * The prompt sent to llama-server must not grow without bound: a long chat
 * would eventually overflow the model context and bloat every request. The
 * newest messages win; the just-sent user message is always kept. Budgets are
 * env-tunable (CHAT_HISTORY_MAX_MESSAGES, CHAT_HISTORY_MAX_CHARS) at the call
 * site; this function stays pure for tests.
 */

export interface HistoryMessage {
  role: string;
  content: string;
}

/**
 * Keep the newest messages up to the message-count and total-character
 * budgets, walking from newest to oldest. Always returns at least the last
 * message, even if it alone exceeds the char budget (the request must carry
 * what the user just sent).
 */
export function trimHistory(
  messages: HistoryMessage[],
  maxMessages: number,
  maxChars: number,
): HistoryMessage[] {
  const last = messages.at(-1);
  if (!last) return [];
  const kept: HistoryMessage[] = [last];
  let chars = last.content.length;
  for (let i = messages.length - 2; i >= 0 && kept.length < maxMessages; i--) {
    const m = messages[i];
    if (!m || chars + m.content.length > maxChars) break;
    kept.push(m);
    chars += m.content.length;
  }
  return kept.toReversed();
}

/** Read the history budgets from env with safe defaults. */
export function historyBudgets(): { maxMessages: number; maxChars: number } {
  return {
    maxMessages: Number(process.env.CHAT_HISTORY_MAX_MESSAGES) || 40,
    maxChars: Number(process.env.CHAT_HISTORY_MAX_CHARS) || 24_000,
  };
}