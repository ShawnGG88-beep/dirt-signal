import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  initAccessibility,
  initTheme,
  installPerfProbeGlobal,
  setDataClient,
  setNotificationAdapter,
} from "@dirt-signal/shared";
import { supabaseDataClient } from "./lib/dataClient";
import { webNotificationAdapter } from "./lib/notifications";

setDataClient(supabaseDataClient);
setNotificationAdapter(webNotificationAdapter);
initTheme();
initAccessibility();
installPerfProbeGlobal();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
