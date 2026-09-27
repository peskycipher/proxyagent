import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = await getDb();
  const chat = await db.get<{ id: string }>("SELECT id FROM chats WHERE id = ? AND user_id = ?", id, session.user.id);
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
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = await getDb();
  const chat = await db.get<{ id: string; title: string }>("SELECT id, title FROM chats WHERE id = ? AND user_id = ?", id, session.user.id);
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });
  const messages = await db.all<{ role: string; content: string; billed_seconds: number | null }>(
    "SELECT role, content, billed_seconds FROM messages WHERE chat_id = ? ORDER BY created_at ASC",
    id,
  );
  return NextResponse.json({ chat, messages });
}
