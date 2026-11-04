"use client";

import { useEffect, useSyncExternalStore } from "react";

// Registers /sw.js (public/sw.js), which caches the app so it opens offline. Production only:
// in dev it would serve stale code over hot reloads, so dev removes any copy left by a prod test.
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    } else {
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
    }
  }, []);
  return null;
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** False while the browser has no network. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Chrome/Edge/Android fire `beforeinstallprompt` once the app is installable; we keep it for our button.
let installPrompt: InstallPrompt | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e as InstallPrompt;
    installListeners.forEach((l) => l());
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installListeners.forEach((l) => l());
  });
}

function subscribeInstall(onChange: () => void) {
  installListeners.add(onChange);
  return () => void installListeners.delete(onChange);
}

/** The "Install app" prompt, or null when the browser doesn't offer one (already installed, iPhone, Firefox…). */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const prompt = useSyncExternalStore(subscribeInstall, () => installPrompt, () => null);
  if (!prompt) return null;
  return async () => {
    await prompt.prompt();
    await prompt.userChoice;
    installPrompt = null;
    installListeners.forEach((l) => l());
  };
}
