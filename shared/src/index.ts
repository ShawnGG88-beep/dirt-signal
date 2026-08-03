/**
 * @dirt-signal/shared: UI, tokens, types and pure logic consumed by both the
 * desktop (Tauri) and web apps.
 */

export * from "./data/types";
export * from "./data/client";

export * from "./components/BandPositionBar";
export * from "./components/EventDetailPopover";
export * from "./components/EventMarkerRail";
export * from "./components/ExportButton";
export * from "./components/LogEventForm";
export * from "./components/MetricDetailModal";
export * from "./components/PlantProfileSection";
export * from "./components/RangePicker";
export * from "./components/Sparkline";
export * from "./components/StatusIndicator";
export * from "./components/SystemStatusLine";
export * from "./components/ThemeToggle";
export * from "./components/TimeSeriesChart";

export * from "./lib/csv";
export * from "./lib/dailySummary";
export * from "./lib/dayNight";
export * from "./lib/derived";
export * from "./lib/eventTypes";
export * from "./lib/growingConstants";
export * from "./lib/hashRoute";
export * from "./lib/metrics";
export * from "./lib/stats";
export * from "./lib/theme";
