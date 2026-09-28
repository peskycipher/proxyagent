import { NextResponse } from "next/server";
import { requireUser, unauthorized } from "@/lib/route-session";
import { getDb } from "@/lib/db";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const rows = await (await getDb()).all<{ id: string; title: string; created_at: number }>(
    `SELECT c.id, c.title, c.created_at, m.created_at AS last_at
     FROM chats c LEFT JOIN messages m ON m.chat_id = c.id AND m.created_at = (SELECT MAX(created_at) FROM messages WHERE chat_id = c.id)
     WHERE c.user_id = ? ORDER BY COALESCE(m.created_at, c.created_at) DESC LIMIT 50`,
    user.id,
  );
  return NextResponse.json({ chats: rows });
}
