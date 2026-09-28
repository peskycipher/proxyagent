import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/route-session";
import { getDb } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const db = await getDb();
  const chat = await db.get<{ id: string }>("SELECT id FROM chats WHERE id = ? AND user_id = ?", id, user.id);
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Atomically remove the thread's messages and the chat row; the messages FK
  // has no ON DELETE CASCADE, so the explicit first step is required.
  await db.batch([
    { sql: "DELETE FROM messages WHERE chat_id = ?", params: [id] },
    { sql: "DELETE FROM chats WHERE id = ?", params: [id] },
  ]);
  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const db = await getDb();
  const chat = await db.get<{ id: string; title: string }>("SELECT id, title FROM chats WHERE id = ? AND user_id = ?", id, user.id);
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });
  const messages = await db.all<{ role: string; content: string; billed_seconds: number | null }>(
    "SELECT role, content, billed_seconds FROM messages WHERE chat_id = ? ORDER BY created_at ASC",
    id,
  );
  return NextResponse.json({ chat, messages });
}
