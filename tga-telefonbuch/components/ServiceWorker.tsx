"use client";

import { useEffect } from "react";

/**
 * Registriert den Offline-Cache. Nur im gebauten Stand aktiv, damit der
 * Entwicklungsmodus nicht gegen einen alten Cache läuft.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ohne Service Worker funktioniert die App weiterhin – nur eben online.
    });
  }, []);

  return null;
}
