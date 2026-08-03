import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  initTheme,
  setDataClient,
  setNotificationAdapter,
} from "@dirt-signal/shared";
import { sidecarDataClient } from "./lib/api";
import { tauriNotificationAdapter } from "./lib/notifications";

setDataClient(sidecarDataClient);
setNotificationAdapter(tauriNotificationAdapter);
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
