import { useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import {
  ProvisionalBadge,
  SemanticStatusBadge,
  ShadowModeBadge,
  type SemanticStatus,
} from "../components/SemanticStatus";
import {
  ReduceMotionToggle,
  ReduceTransparencyToggle,
} from "../components/AccessibilityToggles";
import { ThemeToggle } from "../components/ThemeToggle";
import { CONTRAST_PAIRS, contrastRatio } from "../lib/contrast";
import {
  runPerfProbePair,
  type PerfProbePair,
  type PerfProbeSample,
} from "../lib/perfProbe";
import {
  formatProbeLine,
  useAutoPerfProbe,
} from "../lib/useAutoPerfProbe";
import { useToken } from "../lib/theme";
import { formatDeviceClock, formatDeviceDateTime } from "../lib/formatTime";
import { DEFAULT_DEVICE_TIMEZONE } from "../lib/dayNight";

const CORE_TOKENS = [
  { name: "--terracotta", role: "Primary accent, act now" },
  { name: "--apricot", role: "Highlight, focus, spray windows" },
  { name: "--heather", role: "Night and cold states" },
  { name: "--oxblood", role: "Depth only, never text" },
  { name: "--cellar", role: "Base background" },
  { name: "--cellar-raised", role: "Opaque reading fill" },
  { name: "--parchment", role: "Primary text" },
  { name: "--heather-text", role: "Secondary text on panels" },
  { name: "--vine", role: "Healthy / within range" },
] as const;

const STATUSES: SemanticStatus[] = ["ok", "watch", "act", "cold", "stale"];

function Swatch({ name, role }: { name: string; role: string }) {
  const value = useToken(name);
  return (
    <div className="design-swatch">
      <div
        className="design-swatch-chip"
        style={{ background: `var(${name})` }}
        title={value}
      />
      <div className="design-swatch-meta font-ui">
        <code className="font-telemetry">{name}</code>
        <div>{role}</div>
        <div className="font-telemetry">{value || "…"}</div>
      </div>
    </div>
  );
}

/**
 * Phase 1 showcase: tokens, type, glass layers, status pairs, a11y toggles.
 * Hash route: #/design
 */
export function DesignSystem() {
  const now = new Date();
  const [perf, setPerf] = useState<PerfProbeSample | null>(null);
  const [pair, setPair] = useState<PerfProbePair | null>(null);
  const [perfBusy, setPerfBusy] = useState(false);
  const auto = useAutoPerfProbe();

  async function measurePair() {
    setPerfBusy(true);
    try {
      const result = await runPerfProbePair({ durationMs: 2500 });
      setPair(result);
      setPerf(result.default);
    } finally {
      setPerfBusy(false);
    }
  }

  const shownPair = auto.pair ?? pair;

  return (
    <div className="design-page font-ui">
      <header>
        <h1>Design system</h1>
        <p>
          Cellar at dusk tokens, Recursive type, glass layers, and accessibility
          controls. This page is for redesign review; it is not grower-facing.
        </p>
        <div className="design-controls" style={{ marginTop: "1rem" }}>
          <div className="design-control-block">
            <span>Theme</span>
            <ThemeToggle />
          </div>
          <div className="design-control-block">
            <span>Reduce transparency</span>
            <ReduceTransparencyToggle />
          </div>
          <div className="design-control-block">
            <span>Reduce motion</span>
            <ReduceMotionToggle />
          </div>
          <ShadowModeBadge />
          <ProvisionalBadge />
        </div>
      </header>

      <section>
        <h2>Palette</h2>
        <div className="design-swatch-grid">
          {CORE_TOKENS.map((token) => (
            <Swatch key={token.name} name={token.name} role={token.role} />
          ))}
        </div>
      </section>

      <section>
        <h2>Typography</h2>
        <div className="design-type-row font-ui">
          <span className="muted">UI / prose (MONO 0, CASL 0)</span>
          <p style={{ fontSize: "var(--text-base)", color: "var(--parchment)" }}>
            All six sensors reporting. Expect cooler nights after the front
            passes.
          </p>
        </div>
        <div className="design-type-row font-telemetry">
          <span className="muted">Telemetry (MONO 1)</span>
          <p style={{ fontSize: "var(--text-lg)", color: "var(--parchment)" }}>
            19.4 °C · 38% · 1.75 kPa
          </p>
        </div>
        <div className="design-type-row font-hero">
          <span className="muted">Hero numerals (CASL 0.5, parchment)</span>
          <p style={{ fontSize: "var(--text-3xl)", color: "var(--parchment)" }}>
            26°
          </p>
        </div>
        <div className="design-type-row">
          <span className="muted">
            Device timezone helper ({DEFAULT_DEVICE_TIMEZONE})
          </span>
          <p className="font-telemetry">
            {formatDeviceDateTime(now, { timeZone: DEFAULT_DEVICE_TIMEZONE })} ·{" "}
            {formatDeviceClock(now, { timeZone: DEFAULT_DEVICE_TIMEZONE })}
          </p>
        </div>
      </section>

      <section>
        <h2>Glass layers</h2>
        <p>
          Glass sits over high-contrast shapes so blur, rim light and shadow are
          visible. Toggle reduce transparency to force opaque fills.
        </p>
        <div className="design-glass-stage" style={{ marginTop: "1rem" }}>
          <div className="design-glass-row">
            <GlassPanel layer={1} readingZone>
              <strong>L1</strong>
              <p className="muted">Standard panels. Soft rim and shadow.</p>
            </GlassPanel>
            <GlassPanel layer={2} readingZone>
              <strong>L2</strong>
              <p className="muted">Weather horizon and act advisories.</p>
            </GlassPanel>
            <GlassPanel layer={3} readingZone>
              <strong>L3</strong>
              <p className="muted">Drawers and hour detail.</p>
            </GlassPanel>
          </div>
        </div>
      </section>

      <section>
        <h2>Status (colour + icon + text)</h2>
        <div className="design-controls">
          {STATUSES.map((status) => (
            <SemanticStatusBadge key={status} status={status} />
          ))}
        </div>
      </section>

      <section>
        <h2>Loading skeleton</h2>
        <div className="skeleton" style={{ height: 48, width: "100%" }} />
      </section>

      <section>
        <h2>Contrast pairs (opaque glass fallback)</h2>
        <ul className="design-contrast-list">
          {CONTRAST_PAIRS.map((pair) => {
            const ratio = contrastRatio(pair.fg, pair.bg);
            const need = pair.largeText ? 3 : 4.5;
            const pass = ratio >= need;
            return (
              <li key={pair.id}>
                <span
                  className="design-contrast-swatch"
                  style={{ color: pair.fg, background: pair.bg }}
                >
                  Aa
                </span>{" "}
                {pair.id}: {ratio.toFixed(2)}:1 {pass ? "pass" : "fail"} (need{" "}
                {need}:1)
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2>Frame-time probe</h2>
        <p className="muted">
          rAF deltas are vsync-coupled (reports display refresh). Sync paint cost
          forces a backdrop-filter invalidate and is not refresh-bucketed. On
          Linux WebKitGTK, compare default vs low L1 blur on the sync paint column.
          Open with <code>?autoperf=1#/design</code> to auto-run both probes.
        </p>
        <div className="design-controls">
          <button
            type="button"
            className="btn-secondary"
            disabled={perfBusy || auto.busy}
            onClick={() => void measurePair()}
          >
            Measure default + low L1
          </button>
        </div>
        {auto.error ? <p className="error-text">{auto.error}</p> : null}
        {shownPair ? (
          <div className="font-telemetry">
            <p>
              Default ({shownPair.default.blurL1}):{" "}
              {formatProbeLine(shownPair.default)}
            </p>
            <p>
              Low L1 ({shownPair.lowL1.blurL1}):{" "}
              {formatProbeLine(shownPair.lowL1)}
            </p>
          </div>
        ) : perf ? (
          <p className="font-telemetry">{formatProbeLine(perf)}</p>
        ) : null}
      </section>
    </div>
  );
}
