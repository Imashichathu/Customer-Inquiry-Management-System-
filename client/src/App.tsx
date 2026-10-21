import { useEffect, useState } from "react";

type ApiStatus = "checking" | "available" | "unavailable";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    const controller = new AbortController();

    fetch(`${apiUrl}/api/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("API health check failed");
        }
        return response.json() as Promise<{ status: string }>;
      })
      .then((health) => {
        setApiStatus(health.status === "ok" ? "available" : "unavailable");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setApiStatus("unavailable");
      });

    return () => controller.abort();
  }, []);

  const statusMessage = {
    checking: "Checking the API connection…",
    available: "API is connected",
    unavailable: "API is unavailable. Start the server and database, then refresh.",
  }[apiStatus];

  return (
    <main className="workspace">
      <section className="welcome-card" aria-labelledby="page-title">
        <div className="brand-mark" aria-hidden="true">ID</div>
        <p className="eyebrow">CUSTOMER SUPPORT WORKSPACE</p>
        <h1 id="page-title">Inquiry Desk</h1>
        <p className="intro">
          A clear place for your team to capture customer inquiries and follow
          them through to resolution.
        </p>
        <div
          className={`connection connection--${apiStatus}`}
          role="status"
          aria-live="polite"
        >
          <span className="connection-dot" aria-hidden="true" />
          {statusMessage}
        </div>
        <p className="next-step">
          Workspace setup is ready. Sign-in and inquiry workflows are the next
          step.
        </p>
      </section>
    </main>
  );
}

export default App;
