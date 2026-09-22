import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.title, c.created_at, m.created_at AS last_at
       FROM chats c LEFT JOIN messages m ON m.chat_id = c.id AND m.created_at = (SELECT MAX(created_at) FROM messages WHERE chat_id = c.id)
       WHERE c.user_id = ? ORDER BY COALESCE(m.created_at, c.created_at) DESC LIMIT 50`,
    )
    .all(session.user.id) as Array<{ id: string; title: string; created_at: number }>;
  return NextResponse.json({ chats: rows });
}