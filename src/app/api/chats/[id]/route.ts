import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = getDb();
  const chat = db.prepare("SELECT id, title FROM chats WHERE id = ? AND user_id = ?").get(id, session.user.id) as
    | { id: string; title: string }
    | undefined;
  if (!chat) return NextResponse.json({ error: "not found" }, { status: 404 });
  const messages = db
    .prepare("SELECT role, content, billed_seconds FROM messages WHERE chat_id = ? ORDER BY created_at ASC")
    .all(id) as Array<{ role: string; content: string; billed_seconds: number | null }>;
  return NextResponse.json({ chat, messages });
}