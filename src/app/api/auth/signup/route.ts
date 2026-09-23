import { NextResponse } from "next/server";
import { z } from "zod";
import { createUser } from "@/lib/users";

const bodySchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "email and a password of at least 8 characters required" }, { status: 400 });
  }
  try {
    await createUser(parsed.data.email, parsed.data.password);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
