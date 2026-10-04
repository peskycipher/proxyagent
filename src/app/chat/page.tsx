import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { warmModelOnChatLanding } from "@/lib/inference";

export const dynamic = "force-dynamic";

/**
 * Chat surface: the llama.cpp server WebUI (public/llama-ui — exact SvelteKit
 * static build mirrored from the pod's tunnel), served same-origin in an
 * iframe. The WebUI resolves pod API calls relative to its page path, so they
 * all land on the /llama-ui/[...llamaPath] route handler, which injects the
 * pod's API key server-side and enforces the same per-user lifecycle as
 * /api/chat (lock, balance gate, stop-loss, metered debit, transcript audit).
 * The session redirect below is the hard gate; the proxy is the enforcement.
 */
export default async function Chat() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/chat");
  // Pre-warm the model backend so the first chat message doesn't pay the
  // cold start. Fire-and-forget (see warmModelOnChatLanding) — the render
  // must not block or fail on pod control.
  warmModelOnChatLanding();
  return (
    <iframe
      src="/llama-ui/index.html"
      title="Chat"
      className="fixed inset-0 h-full w-full border-0"
      allow="clipboard-write"
    />
  );
}