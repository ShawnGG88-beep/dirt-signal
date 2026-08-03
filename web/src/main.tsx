import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  initTheme,
  setDataClient,
  setNotificationAdapter,
} from "@dirt-signal/shared";
import { supabaseDataClient } from "./lib/dataClient";
import { webNotificationAdapter } from "./lib/notifications";

setDataClient(supabaseDataClient);
setNotificationAdapter(webNotificationAdapter);
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
