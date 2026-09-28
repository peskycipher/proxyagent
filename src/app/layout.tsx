import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "proxy-agent",
  description: "Uncensored AI chat, metered to the second",
};

/** Mobile browsers otherwise fall back to a ~980px virtual desktop viewport. */
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* suppressHydrationWarning: the theme-init script (below) intentionally
       mutates <html data-theme> from localStorage before React hydrates, so
       the server HTML can't match that attribute. Scoped to this element's
       own attributes only — child mismatches are still reported. */
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Apply the persisted theme before first paint to avoid a flash.
            Fully static inline script (no user input). */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
