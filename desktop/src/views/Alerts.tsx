import { useCallback, useEffect, useState } from "react";
import {
  acknowledgeAlert,
  evaluateAlerts,
  fetchAlertRules,
  fetchAlerts,
  markAlertNotified,
  patchAlertRule,
  type AlertEvent,
  type AlertRule,
  type AlertRuleType,
  type AlertSeverity,
} from "../lib/api";
import { ensureNotificationPermission, notifyAlert } from "../lib/notifications";

const DEVICE_NAME = "pi-garden-01";
const POLL_MS = 30_000;

const RULE_LABELS: Record<AlertRuleType, string> = {
  frost_risk: "Frost risk",
  sustained_out_of_bounds: "Sustained out of bounds",
  approaching_bound: "Approaching bound",
  collector_silence: "Collector silence",
  irrigation_due: "Irrigation due",
  disease_pressure: "Disease pressure (proxy)",
};

const RULE_NOTES: Partial<Record<AlertRuleType, string>> = {
  frost_risk:
    "Trailing indicator from a single ambient sensor with no weather forecast. Not a frost forecast. Indoor tomato deployments will rarely fire; the rule exists for outdoor use.",
  disease_pressure:
    "Leaf-wetness proxy from high-humidity hours, not a disease risk score.",
  approaching_bound:
    "Early-warning tier; most likely to be noisy. Ships disabled.",
  irrigation_due:
    "Only fires when a dry-down projection is available and not suppressed.",
};

function severityColour(severity: AlertSeverity): string {
  if (severity === "critical") return "#ff4444";
  if (severity === "warning") return "#FF8A00";
  return "#107EEC";
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function modeLabel(rule: AlertRule): string {
  if (!rule.enabled) return "disabled";
  if (!rule.notify) return "shadow";
  return "notify";
}

export function Alerts() {
  const [openAlerts, setOpenAlerts] = useState<AlertEvent[]>([]);
  const [history, setHistory] = useState<AlertEvent[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evalNote, setEvalNote] = useState<string | null>(null);
  const [permissionOk, setPermissionOk] = useState<boolean | null>(null);
  const [ackDraft, setAckDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [openRes, allRes, rulesRes] = await Promise.all([
        fetchAlerts({ deviceName: DEVICE_NAME, status: "open" }),
        fetchAlerts({ deviceName: DEVICE_NAME, status: "all", limit: 50 }),
        fetchAlertRules(DEVICE_NAME),
      ]);
      setOpenAlerts(openRes.alerts);
      setHistory(allRes.alerts);
      setRules(rulesRes.rules);
      setError(null);

      // Deliver OS notifications for promoted, unacknowledged, not-yet-notified
      for (const alert of openRes.alerts) {
        if (
          alert.rule_notify &&
          !alert.acknowledged_at &&
          !alert.notified
        ) {
          const sent = await notifyAlert(alert);
          if (sent) {
            await markAlertNotified(alert.id);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    void ensureNotificationPermission().then(setPermissionOk);
  }, []);

  async function onAcknowledge(alertId: string) {
    try {
      await acknowledgeAlert(alertId, ackDraft[alertId] ?? null);
      setAckDraft((d) => {
        const next = { ...d };
        delete next[alertId];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onToggleEnabled(rule: AlertRule) {
    try {
      await patchAlertRule(rule.id, { enabled: !rule.enabled });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onPromoteNotify(rule: AlertRule) {
    try {
      await patchAlertRule(rule.id, { notify: !rule.notify });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onSnooze(rule: AlertRule, hours: number) {
    try {
      const until = new Date(Date.now() + hours * 3600_000).toISOString();
      await patchAlertRule(rule.id, { snoozed_until: until });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onClearSnooze(rule: AlertRule) {
    try {
      await patchAlertRule(rule.id, { clear_snooze: true });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onEvaluate() {
    try {
      const result = await evaluateAlerts();
      setEvalNote(
        `Evaluated ${result.evaluated} checks · opened ${result.opened} · closed ${result.closed}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="alerts-view">
      <header className="alerts-header">
        <div>
          <h1>Alerts</h1>
          <p className="subtitle">In-app rule evaluation and firing history</p>
        </div>
        <div className="alerts-header-actions">
          <button type="button" className="btn-secondary" onClick={() => void onEvaluate()}>
            Evaluate now
          </button>
          <button type="button" className="btn-secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>

      <aside className="alerts-honesty" role="note">
        <strong>Coverage limit.</strong> Alerts are evaluated only while this
        desktop app (and its sidecar) is running. Nothing fires while the app is
        closed. A frost overnight with the laptop shut will be recorded on next
        launch but will not notify in time to act. This is an in-app alerting
        layer, not a monitoring service. Continuous coverage (sidecar-as-service
        or evaluation on the collector) is future work.
      </aside>

      {permissionOk === false && (
        <p className="alerts-permission-warn">
          Desktop notification permission is not granted. Promoted rules will
          still record firings; OS toasts will not appear until permission is
          allowed.
        </p>
      )}

      {error && <p className="error-text">{error}</p>}
      {evalNote && <p className="alerts-eval-note">{evalNote}</p>}
      {loading && <p className="muted">Loading alerts…</p>}

      <section className="alerts-section">
        <h2>
          Open{" "}
          <span className="muted">({openAlerts.length})</span>
        </h2>
        {openAlerts.length === 0 && !loading && (
          <p className="muted">No open alerts.</p>
        )}
        <ul className="alerts-list">
          {openAlerts.map((alert) => (
            <li key={alert.id} className="alerts-item">
              <div className="alerts-item-head">
                <span
                  className="alerts-severity"
                  style={{ color: severityColour(alert.severity) }}
                >
                  {alert.severity}
                </span>
                <span className="alerts-rule-type">
                  {alert.rule_type
                    ? RULE_LABELS[alert.rule_type]
                    : alert.rule_id.slice(0, 8)}
                </span>
                <span className="muted">{formatWhen(alert.opened_at)}</span>
                {!alert.rule_notify && (
                  <span className="alerts-badge">shadow</span>
                )}
                {alert.acknowledged_at && (
                  <span className="alerts-badge">acked</span>
                )}
              </div>
              <p className="alerts-message">{alert.message}</p>
              {!alert.acknowledged_at && (
                <div className="alerts-ack-row">
                  <input
                    type="text"
                    placeholder="Optional note"
                    value={ackDraft[alert.id] ?? ""}
                    onChange={(e) =>
                      setAckDraft((d) => ({
                        ...d,
                        [alert.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void onAcknowledge(alert.id)}
                  >
                    Acknowledge
                  </button>
                </div>
              )}
              <p className="muted alerts-ack-hint">
                Acknowledge suppresses notification but does not close the
                alert. It closes only when the clear condition is met.
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="alerts-section">
        <h2>Rules</h2>
        <p className="muted alerts-rules-intro">
          Every rule ships in shadow mode (enabled, notify off) except
          approaching bound, which ships disabled. Promote notify only after
          watching firings against real sensor traces.
        </p>
        <ul className="alerts-rules">
          {rules.map((rule) => (
            <li key={rule.id} className="alerts-rule">
              <div className="alerts-rule-head">
                <strong>{RULE_LABELS[rule.rule_type]}</strong>
                <span className={`alerts-mode alerts-mode-${modeLabel(rule)}`}>
                  {modeLabel(rule)}
                </span>
              </div>
              {RULE_NOTES[rule.rule_type] && (
                <p className="muted alerts-rule-note">
                  {RULE_NOTES[rule.rule_type]}
                </p>
              )}
              <div className="alerts-rule-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void onToggleEnabled(rule)}
                >
                  {rule.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void onPromoteNotify(rule)}
                  disabled={!rule.enabled}
                  title={
                    rule.notify
                      ? "Return to shadow mode"
                      : "Promote: send desktop notifications"
                  }
                >
                  {rule.notify ? "Demote to shadow" : "Promote notify"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void onSnooze(rule, 6)}
                >
                  Snooze 6h
                </button>
                {rule.snoozed_until && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => void onClearSnooze(rule)}
                  >
                    Clear snooze
                  </button>
                )}
              </div>
              {rule.snoozed_until && (
                <p className="muted">
                  Snoozed until {formatWhen(rule.snoozed_until)}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="alerts-section">
        <h2>History</h2>
        <ul className="alerts-list alerts-history">
          {history.map((alert) => (
            <li key={alert.id} className="alerts-item alerts-item-compact">
              <div className="alerts-item-head">
                <span
                  className="alerts-severity"
                  style={{ color: severityColour(alert.severity) }}
                >
                  {alert.severity}
                </span>
                <span className="alerts-rule-type">
                  {alert.rule_type
                    ? RULE_LABELS[alert.rule_type]
                    : "rule"}
                </span>
                <span className="muted">
                  {formatWhen(alert.opened_at)}
                  {alert.closed_at
                    ? ` → ${formatWhen(alert.closed_at)}`
                    : " · open"}
                </span>
              </div>
              <p className="alerts-message">{alert.message}</p>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
