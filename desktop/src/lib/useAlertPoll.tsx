/**
 * App-level alert poll — single shared instance for notifications + open state.
 *
 * Mount AlertPollProvider once in App.tsx. Alerts view and SystemStatusLine
 * consume the same state; only one interval runs regardless of consumers.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchAlertRules,
  fetchAlerts,
  markAlertNotified,
  type AlertEvent,
  type AlertRule,
  type AlertSeverity,
} from "./api";
import {
  ensureNotificationPermission,
  isNotificationPermissionGranted,
  notifyAlert,
} from "./notifications";

const DEVICE_NAME = "pi-garden-01";
const POLL_MS = 30_000;

interface AlertPollValue {
  openAlerts: AlertEvent[];
  /** Promoted (notify=true) open alerts — for Dashboard badge only. */
  openNotifyAlerts: AlertEvent[];
  openNotifyCount: number;
  worstNotifySeverity: AlertSeverity | null;
  rules: AlertRule[];
  permissionDenied: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
  setRules: (rules: AlertRule[]) => void;
}

const AlertPollContext = createContext<AlertPollValue | null>(null);

let subscriberCount = 0;
let sharedTimer: number | null = null;
let sharedRefresh: (() => Promise<void>) | null = null;

async function deliverNotifications(alerts: AlertEvent[]): Promise<void> {
  const granted = await isNotificationPermissionGranted();
  if (!granted) return;
  for (const alert of alerts) {
    if (alert.rule_notify && !alert.acknowledged_at && !alert.notified) {
      const sent = await notifyAlert(alert);
      if (sent) {
        await markAlertNotified(alert.id);
      }
    }
  }
}

export function AlertPollProvider({ children }: { children: ReactNode }) {
  const [openAlerts, setOpenAlerts] = useState<AlertEvent[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [openRes, rulesRes] = await Promise.all([
        fetchAlerts({ deviceName: DEVICE_NAME, status: "open" }),
        fetchAlertRules(DEVICE_NAME),
      ]);
      if (!mounted.current) return;
      setOpenAlerts(openRes.alerts);
      setRules(rulesRes.rules);
      setLastError(null);
      await deliverNotifications(openRes.alerts);
      // Re-fetch open after mark-notified so notified flags stick in UI
      const refreshed = await fetchAlerts({
        deviceName: DEVICE_NAME,
        status: "open",
      });
      if (mounted.current) setOpenAlerts(refreshed.alerts);
    } catch (err) {
      if (mounted.current) {
        setLastError(err instanceof Error ? err.message : String(err));
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    sharedRefresh = refresh;
    subscriberCount += 1;
    void refresh();
    if (sharedTimer === null) {
      sharedTimer = window.setInterval(() => {
        void sharedRefresh?.();
      }, POLL_MS);
    }
    return () => {
      mounted.current = false;
      subscriberCount -= 1;
      if (subscriberCount <= 0 && sharedTimer !== null) {
        window.clearInterval(sharedTimer);
        sharedTimer = null;
        sharedRefresh = null;
        subscriberCount = 0;
      }
    };
  }, [refresh]);

  const requestPermission = useCallback(async () => {
    const ok = await ensureNotificationPermission();
    setPermissionDenied(!ok);
    return ok;
  }, []);

  const openNotifyAlerts = useMemo(
    () => openAlerts.filter((a) => a.rule_notify === true),
    [openAlerts],
  );

  const worstNotifySeverity = useMemo(() => {
    if (openNotifyAlerts.some((a) => a.severity === "critical")) return "critical";
    if (openNotifyAlerts.some((a) => a.severity === "warning")) return "warning";
    if (openNotifyAlerts.length > 0) return "info";
    return null;
  }, [openNotifyAlerts]);

  const value = useMemo<AlertPollValue>(
    () => ({
      openAlerts,
      openNotifyAlerts,
      openNotifyCount: openNotifyAlerts.length,
      worstNotifySeverity,
      rules,
      permissionDenied,
      lastError,
      refresh,
      requestPermission,
      setRules,
    }),
    [
      openAlerts,
      openNotifyAlerts,
      worstNotifySeverity,
      rules,
      permissionDenied,
      lastError,
      refresh,
      requestPermission,
    ],
  );

  return (
    <AlertPollContext.Provider value={value}>
      {children}
    </AlertPollContext.Provider>
  );
}

export function useAlertPoll(): AlertPollValue {
  const ctx = useContext(AlertPollContext);
  if (!ctx) {
    throw new Error("useAlertPoll must be used within AlertPollProvider");
  }
  return ctx;
}
