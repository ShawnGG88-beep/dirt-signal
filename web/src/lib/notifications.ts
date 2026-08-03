/**
 * Web Notifications implementation of the shared notification seam.
 *
 * Honesty note: Safari on iOS exposes the Notification API only inside an
 * installed (Add to Home Screen) PWA. In a normal browser tab there,
 * "Notification" is absent from window, so isPermissionGranted() reports
 * false rather than pretending delivery is possible.
 */

import type { AlertEvent, NotificationAdapter } from "@dirt-signal/shared";

function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export const webNotificationAdapter: NotificationAdapter = {
  async isPermissionGranted(): Promise<boolean> {
    return notificationsSupported() && Notification.permission === "granted";
  },

  async ensurePermission(): Promise<boolean> {
    if (!notificationsSupported()) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    try {
      const permission = await Notification.requestPermission();
      return permission === "granted";
    } catch {
      return false;
    }
  },

  async notify(alert: AlertEvent): Promise<boolean> {
    if (!notificationsSupported()) return false;
    if (Notification.permission !== "granted") return false;
    try {
      const title = `Dirt Signal · ${alert.severity}`;
      const body = alert.message.slice(0, 180);
      new Notification(title, { body });
      return true;
    } catch {
      return false;
    }
  },
};
