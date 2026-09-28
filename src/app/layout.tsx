import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "proxy-agent",
  description: "Uncensored AI chat, metered to the second",
};

/** Mobile browsers otherwise fall back to a ~980px virtual desktop viewport. */
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
