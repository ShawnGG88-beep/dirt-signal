/**
 * Platform notification seam for promoted (notify=true) alerts.
 *
 * Desktop registers a Tauri adapter at startup; web registers a Web
 * Notifications adapter. The default no-op adapter reports permission as
 * never granted, so alert polling silently skips delivery until an adapter
 * is registered. The exported function names mirror the original desktop
 * notifications module so consuming code is unchanged by the extraction.
 */

import type { AlertEvent } from "../data/types";

export interface NotificationAdapter {
  /** Check only — must not prompt the user. */
  isPermissionGranted(): Promise<boolean>;
  /** Request OS notification permission (call on first promote only). */
  ensurePermission(): Promise<boolean>;
  /** Send a toast if permission is already granted — never prompts. */
  notify(alert: AlertEvent): Promise<boolean>;
}

const noopAdapter: NotificationAdapter = {
  isPermissionGranted: async () => false,
  ensurePermission: async () => false,
  notify: async () => false,
};

let activeAdapter: NotificationAdapter = noopAdapter;

/** Register the platform adapter once at startup, before first render. */
export function setNotificationAdapter(adapter: NotificationAdapter): void {
  activeAdapter = adapter;
}

export async function isNotificationPermissionGranted(): Promise<boolean> {
  return activeAdapter.isPermissionGranted();
}

export async function ensureNotificationPermission(): Promise<boolean> {
  return activeAdapter.ensurePermission();
}

export async function notifyAlert(alert: AlertEvent): Promise<boolean> {
  return activeAdapter.notify(alert);
}
