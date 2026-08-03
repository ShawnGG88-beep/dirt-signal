import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initTheme, setDataClient } from "@dirt-signal/shared";
import { sidecarDataClient } from "./lib/api";

setDataClient(sidecarDataClient);
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
