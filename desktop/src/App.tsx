import { useState } from "react";
import { Dashboard } from "./views/Dashboard";
import { History } from "./views/History";
import { Reports } from "./views/Reports";
import "./styles/global.css";

type AppView = "dashboard" | "history" | "reports";

const NAV: { id: AppView; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "history", label: "History" },
  { id: "reports", label: "Reports" },
];

function App() {
  const [view, setView] = useState<AppView>("dashboard");

  return (
    <main className="app">
      <nav className="app-nav" aria-label="Main">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              view === item.id ? "app-nav-btn app-nav-btn-active" : "app-nav-btn"
            }
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {view === "dashboard" && <Dashboard />}
      {view === "history" && <History />}
      {view === "reports" && <Reports />}
    </main>
  );
}

export default App;
