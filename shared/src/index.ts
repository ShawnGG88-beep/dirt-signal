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
export * from "./components/GlassPanel";
export * from "./components/LogEventForm";
export * from "./components/MetricDetailModal";
export * from "./components/PlantProfileSection";
export * from "./components/RangePicker";
export * from "./components/SemanticStatus";
export * from "./components/AccessibilityToggles";
export * from "./components/Sparkline";
export * from "./components/StatusIndicator";
export * from "./components/SystemStatusLine";
export * from "./components/ThemeToggle";
export * from "./components/TimeSeriesChart";
export * from "./components/WeatherHorizon";
export * from "./components/ConsequenceLanes";
export * from "./components/DashboardStatusSentence";
export * from "./components/NeedsAttention";
export * from "./components/SensorTile";

export * from "./lib/accessibility";
export * from "./lib/contrast";
export * from "./lib/csv";
export * from "./lib/dailySummary";
export * from "./lib/dayNight";
export * from "./lib/derived";
export * from "./lib/formatTime";
export * from "./lib/phenology";
export * from "./lib/perfProbe";
export * from "./lib/useAutoPerfProbe";
export * from "./lib/device";
export * from "./lib/eventTypes";
export * from "./lib/growingConstants";
export * from "./lib/hashRoute";
export * from "./lib/metrics";
export * from "./lib/notifications";
export * from "./lib/advisories";
export { findSprayWindow, type SprayWindowResult } from "./lib/sprayWindow";
export { suggestCaptureTime, type CaptureSuggestion } from "./lib/captureSchedule";
export * from "./lib/stormRisk";
export * from "./lib/stats";
export * from "./lib/theme";
export * from "./lib/useAlertPoll";
export * from "./lib/weatherHorizon";
export * from "./lib/consequenceLanes";
export * from "./lib/dashboardStatus";
export * from "./lib/sensorModes";
export * from "./lib/viewTransition";

export * from "./views/Alerts";
export * from "./views/Dashboard";
export * from "./views/DesignSystem";
export * from "./views/History";
export * from "./views/Reports";
