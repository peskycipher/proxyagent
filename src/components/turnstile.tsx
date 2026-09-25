"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile widget (explicit rendering, managed mode).
 * Renders nothing when siteKey is empty — captcha is opt-in via env:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (public, safe to inline at build time)
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

function loadScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.turnstile) return Promise.resolve(true);
  return new Promise((resolve) => {
    const prev = window.onTurnstileLoad;
    // api.js?render=explicit&onload=onTurnstileLoad calls this when ready
    window.onTurnstileLoad = () => {
      prev?.();
      resolve(true);
    };
    if (!document.querySelector(`script[src^="${SCRIPT_URL}"]`)) {
      const s = document.createElement("script");
      s.src = `${SCRIPT_URL}?render=explicit&onload=onTurnstileLoad`;
      s.async = true;
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    }
  });
}

export default function Turnstile({
  siteKey,
  action,
  onToken,
  /** Bump this number to force a fresh solve (e.g. after a token was consumed). */
  resetSignal = 0,
}: {
  siteKey: string;
  /** Canonical action bound into the token; the server checks it at siteverify. */
  action?: string;
  /** Called with the token on success, and with "" on expiry/error/reset. */
  onToken: (token: string) => void;
  resetSignal?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const firstRun = useRef(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey || !host.current) return;
    // A resetSignal bump (after the first mount) means the current token was
    // consumed: re-run the widget for a fresh one instead of re-rendering.
    if (!firstRun.current) {
      if (widgetId.current !== null && window.turnstile) {
        try {
          window.turnstile.reset(widgetId.current);
        } catch {
          /* widget already gone */
        }
      }
      return;
    }
    firstRun.current = false;
    let cancelled = false;

    loadScript().then((loaded) => {
      if (cancelled) return;
      if (!loaded || !window.turnstile) {
        setFailed(true);
        return;
      }
      if (widgetId.current !== null) return; // already rendered
      widgetId.current = window.turnstile.render(host.current!, {
        sitekey: siteKey,
        ...(action ? { action } : {}),
        callback: (token: string) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(""),
        "error-callback": () => {
          setFailed(true);
          onTokenRef.current("");
        },
        theme: "auto",
      });
    });

    return () => {
      cancelled = true;
      if (widgetId.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* widget already gone */
        }
        widgetId.current = null;
      }
    };
  }, [siteKey, action, resetSignal]);

  if (!siteKey) return null;

  return (
    <div>
      <div ref={host} />
      {failed && (
        <div className="muted" style={{ fontSize: 13 }}>
          Captcha failed to load — refresh the page and try again.
        </div>
      )}
    </div>
  );
}