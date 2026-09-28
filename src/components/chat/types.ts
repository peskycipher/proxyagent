/** Shared chat types used by the chat page components. */

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSummary {
  id: string;
  title: string;
}

/** Below this many seconds the countdown turns red and a purchase toast shows. */
export const LOW_BALANCE_SECONDS = 900; // 15 minutes