import { useSyncExternalStore } from "react";
import { useLastSuccessfulFetchMs } from "../lib/freshness";

function subscribeOnline(listener: () => void): () => void {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Clear offline state: the service worker caches only the app shell, so
 * without a connection the data on screen is whatever loaded last. Shows
 * the timestamp of the last successful fetch so staleness is unambiguous.
 */
export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const lastFetchMs = useLastSuccessfulFetchMs();

  if (online) return null;

  return (
    <div className="offline-banner" role="alert">
      <strong>Offline.</strong> Readings shown are not live.
      {lastFetchMs != null
        ? ` Last successful update ${formatWhen(lastFetchMs)}.`
        : " Nothing has loaded in this session yet."}
    </div>
  );
}
