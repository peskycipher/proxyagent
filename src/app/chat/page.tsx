import { redirect } from "next/navigation";
import { auth } from "@/auth";
import ChatClient from "./chat-client";

export const dynamic = "force-dynamic";

export default async function Chat() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/chat");
  return <ChatClient userEmail={session.user.email ?? ""} />;
}