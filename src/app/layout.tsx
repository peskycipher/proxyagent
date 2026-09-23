import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "proxy-agent",
  description: "Uncensored AI chat, metered to the second",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
