/** Shared chat types used by the chat page components. */

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSummary {
  id: string;
  title: string;
}