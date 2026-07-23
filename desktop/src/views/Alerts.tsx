import { useCallback, useEffect, useState } from "react";
import {
  acknowledgeAlert,
  evaluateAlerts,
  fetchAlerts,
  patchAlertRule,
  type AlertEvent,
  type AlertRule,
  type AlertRuleType,
  type AlertSeverity,
} from "../lib/api";
import { alertsToCsv, downloadCsv } from "../lib/csv";
import { rangeFromPreset, type RangePreset } from "../lib/metrics";
import { useAlertPoll } from "../lib/useAlertPoll";
import { LogEventForm } from "../components/LogEventForm";
import { RangePicker } from "../components/RangePicker";
import type { PlantEventTypeKey } from "../lib/eventTypes";

const DEVICE_NAME = "pi-garden-01";
const HIGH_FIRE_CAUTION = 14;

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

function eventTypeForAlert(alert: AlertEvent): PlantEventTypeKey {
  if (
    alert.rule_type === "irrigation_due" ||
    alert.metric_key === "moisture_pct"
  ) {
    return "irrigation";
  }
  if (alert.rule_type === "disease_pressure") {
    return "pest_disease_treatment";
  }
  return "observation";
}

export function Alerts() {
  const {
    openAlerts,
    rules,
    permissionDenied,
    lastError,
    refresh,
    requestPermission,
    setRules,
  } = useAlertPoll();

  const [history, setHistory] = useState<AlertEvent[]>([]);
  const [historyRange, setHistoryRange] = useState<RangePreset>("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evalNote, setEvalNote] = useState<string | null>(null);
  const [ackDraft, setAckDraft] = useState<Record<string, string>>({});
  const [prefillEvent, setPrefillEvent] = useState<{
    type: PlantEventTypeKey;
    note: string;
  } | null>(null);
  const [pendingLogOffer, setPendingLogOffer] = useState<{
    type: PlantEventTypeKey;
    note: string;
  } | null>(null);

  const loadHistory = useCallback(async () => {
    const { from, to } = rangeFromPreset(historyRange);
    try {
      const allRes = await fetchAlerts({
        deviceName: DEVICE_NAME,
        status: "all",
        fromAt: from,
        toAt: to,
        limit: 500,
      });
      setHistory(allRes.alerts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [historyRange]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function onAcknowledge(alert: AlertEvent) {
    const note = ackDraft[alert.id]?.trim() || null;
    try {
      await acknowledgeAlert(alert.id, note);
      setAckDraft((d) => {
        const next = { ...d };
        delete next[alert.id];
        return next;
      });
      await refresh();
      await loadHistory();
      if (note) {
        setPendingLogOffer({
          type: eventTypeForAlert(alert),
          note,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onToggleEnabled(rule: AlertRule) {
    try {
      const updated = await patchAlertRule(rule.id, { enabled: !rule.enabled });
      setRules(rules.map((r) => (r.id === rule.id ? { ...r, ...updated } : r)));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onPromoteNotify(rule: AlertRule) {
    const promoting = !rule.notify;
    try {
      if (promoting) {
        await requestPermission();
      }
      const updated = await patchAlertRule(rule.id, { notify: promoting });
      setRules(rules.map((r) => (r.id === rule.id ? { ...r, ...updated } : r)));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onSnooze(rule: AlertRule, hours: number) {
    try {
      const until = new Date(Date.now() + hours * 3600_000).toISOString();
      await patchAlertRule(rule.id, { snoozed_until: until });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onClearSnooze(rule: AlertRule) {
    try {
      await patchAlertRule(rule.id, { clear_snooze: true });
      await refresh();
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
      await refresh();
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const { from: histFrom, to: histTo } = rangeFromPreset(historyRange);

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
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              void refresh();
              void loadHistory();
            }}
          >
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

      {(error || lastError) && (
        <p className="error-text">{error || lastError}</p>
      )}
      {evalNote && <p className="alerts-eval-note">{evalNote}</p>}
      {loading && <p className="muted">Loading alerts…</p>}

      {pendingLogOffer && (
        <aside className="alerts-log-offer" role="dialog" aria-label="Log event offer">
          <p>
            Acknowledge note saved. Open a plant event prefilled with that note?
          </p>
          <div className="alerts-log-offer-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setPrefillEvent(pendingLogOffer);
                setPendingLogOffer(null);
              }}
            >
              Open log form
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPendingLogOffer(null)}
            >
              Dismiss
            </button>
          </div>
        </aside>
      )}

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
                    onClick={() => void onAcknowledge(alert)}
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
        {permissionDenied && (
          <aside className="alerts-permission-warn" role="status">
            Notification permission was denied. Promoted rules will still
            record firings but produce no toasts.{" "}
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void requestPermission()}
            >
              Re-request permission
            </button>
          </aside>
        )}
        <ul className="alerts-rules">
          {rules.map((rule) => {
            const fired7 = rule.fired_7d ?? 0;
            const fired30 = rule.fired_30d ?? 0;
            const highFire = fired7 > HIGH_FIRE_CAUTION;
            return (
              <li key={rule.id} className="alerts-rule">
                <div className="alerts-rule-head">
                  <strong>{RULE_LABELS[rule.rule_type]}</strong>
                  <span className={`alerts-mode alerts-mode-${modeLabel(rule)}`}>
                    {modeLabel(rule)}
                  </span>
                </div>
                <p className="alerts-rule-firings">
                  <span>
                    {fired7} firings / 7d
                  </span>
                  <span className="muted">·</span>
                  <span>
                    {fired30} / 30d
                  </span>
                  <span className="muted">·</span>
                  <span>
                    last{" "}
                    {rule.last_fired_at
                      ? formatWhen(rule.last_fired_at)
                      : "never"}
                  </span>
                </p>
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
                  <span className="alerts-promote-wrap">
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
                    {highFire && (
                      <span className="alerts-fire-caution" title="More than twice daily">
                        High recent firings — review before promoting
                      </span>
                    )}
                  </span>
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
            );
          })}
        </ul>
      </section>

      <section className="alerts-section">
        <div className="alerts-history-toolbar">
          <h2>History</h2>
          <div className="view-toolbar">
            <RangePicker value={historyRange} onChange={setHistoryRange} />
            <button
              type="button"
              className="export-btn"
              disabled={history.length === 0}
              onClick={() => {
                const csv = alertsToCsv(history);
                const fromTag = histFrom.toISOString().slice(0, 10);
                const toTag = histTo.toISOString().slice(0, 10);
                downloadCsv(
                  `dirt-signal-alerts_${fromTag}_to_${toTag}.csv`,
                  csv,
                );
              }}
            >
              Export CSV
            </button>
          </div>
        </div>
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

      {prefillEvent && (
        <LogEventForm
          deviceName={DEVICE_NAME}
          initialEventType={prefillEvent.type}
          initialNote={prefillEvent.note}
          onClose={() => setPrefillEvent(null)}
          onSaved={() => setPrefillEvent(null)}
        />
      )}
    </section>
  );
}
