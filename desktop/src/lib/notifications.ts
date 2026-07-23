/** Tauri desktop notification helpers for promoted (notify=true) alerts. */

import type { AlertEvent } from "./api";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Check only — does not prompt the user. */
export async function isNotificationPermissionGranted(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { isPermissionGranted } = await import(
      "@tauri-apps/plugin-notification"
    );
    return await isPermissionGranted();
  } catch {
    return false;
  }
}

/** Request OS notification permission (call on first promote only). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const {
      isPermissionGranted,
      requestPermission,
    } = await import("@tauri-apps/plugin-notification");
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    return granted;
  } catch {
    return false;
  }
}

/** Send a toast if permission is already granted — never prompts. */
export async function notifyAlert(alert: AlertEvent): Promise<boolean> {
  if (!isTauri()) return false;
  const granted = await isNotificationPermissionGranted();
  if (!granted) return false;
  try {
    const { sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    const title = `Dirt Signal · ${alert.severity}`;
    const body = alert.message.slice(0, 180);
    sendNotification({ title, body });
    return true;
  } catch {
    return false;
  }
}
