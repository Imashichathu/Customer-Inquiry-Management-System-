import { useEffect, useState, type FormEvent } from "react";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type InquiryStatus = "new" | "in_progress" | "resolved";
type User = { id: number; fullName: string; email: string };
type Inquiry = {
  id: number;
  customerName: string;
  contactMethod: string;
  subject: string;
  description: string;
  status: InquiryStatus;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
};
type InquiryInput = Pick<Inquiry, "customerName" | "contactMethod" | "subject" | "description">;

class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(typeof payload.message === "string" ? payload.message : "The request failed.");
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = response.status === 204
    ? {}
    : await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }
  return payload as T;
}

const statusLabels: Record<InquiryStatus, string> = {
  new: "New",
  in_progress: "In Progress",
  resolved: "Resolved",
};

function App() {
  const [authState, setAuthState] = useState<"loading" | "signed_out" | "ready" | "unavailable">("loading");
  const [user, setUser] = useState<User | null>(null);
  const [signInError, setSignInError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [listError, setListError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(readInquiryId);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [detailState, setDetailState] = useState<"loading" | "ready" | "error">("loading");
  const [detailError, setDetailError] = useState("");
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusNotice, setStatusNotice] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [savingInquiry, setSavingInquiry] = useState(false);
  const [createError, setCreateError] = useState("");
  const [accountError, setAccountError] = useState("");

  useEffect(() => {
    let active = true;
    request<{ user: User }>("/api/auth/me")
      .then(({ user: currentUser }) => {
        if (active) {
          setUser(currentUser);
          setAuthState("ready");
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setAuthState("signed_out");
        } else {
          setAuthState("unavailable");
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setSelectedId(readInquiryId());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (authState !== "ready") return;
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    setListState("loading");
    setListError("");
    request<{ inquiries: Inquiry[] }>(`/api/inquiries?${params}`, { signal: controller.signal })
      .then(({ inquiries: results }) => {
        setInquiries(results);
        setListState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          setAuthState("signed_out");
          return;
        }
        setListError(error instanceof Error ? error.message : "Could not load inquiries.");
        setListState("error");
      });
    return () => controller.abort();
  }, [authState, search, statusFilter, refreshKey]);

  useEffect(() => {
    if (authState !== "ready" || selectedId === null) {
      setSelected(null);
      return;
    }

    let active = true;
    setDetailState("loading");
    setDetailError("");
    setStatusNotice("");
    request<{ inquiry: Inquiry }>(`/api/inquiries/${selectedId}`)
      .then(({ inquiry }) => {
        if (active) {
          setSelected(inquiry);
          setDetailState("ready");
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
          setAuthState("signed_out");
          return;
        }
        setDetailError(error instanceof Error ? error.message : "Could not load this inquiry.");
        setDetailState("error");
      });
    return () => { active = false; };
  }, [authState, selectedId, refreshKey]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSignInError("");
    setSigningIn(true);
    const form = new FormData(event.currentTarget);
    try {
      const result = await request<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      setUser(result.user);
      setAuthState("ready");
    } catch (error) {
      setSignInError(error instanceof Error ? error.message : "Could not sign in. Try again.");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    setAccountError("");
    try {
      await request("/api/auth/logout", { method: "POST" });
      setUser(null);
      setAuthState("signed_out");
      setSelectedId(null);
      setSelected(null);
      window.history.pushState({}, "", window.location.pathname);
    } catch {
      setAccountError("Could not sign out. Check your connection and try again.");
    }
  }

  async function handleCreateInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError("");
    setSavingInquiry(true);
    const form = new FormData(event.currentTarget);
    const input: InquiryInput = {
      customerName: String(form.get("customerName") ?? "").trim(),
      contactMethod: String(form.get("contactMethod") ?? "").trim(),
      subject: String(form.get("subject") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
    };
    try {
      const result = await request<{ inquiry: Inquiry }>("/api/inquiries", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setShowCreateForm(false);
      setSelectedId(result.inquiry.id);
      setSelected(result.inquiry);
      setDetailState("ready");
      window.history.pushState({}, "", `?inquiry=${result.inquiry.id}`);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState("signed_out");
        return;
      }
      setCreateError(error instanceof Error ? error.message : "Could not save this inquiry.");
    } finally {
      setSavingInquiry(false);
    }
  }

  async function handleStatusChange(status: InquiryStatus) {
    if (!selected) return;
    setStatusSaving(true);
    setStatusNotice("");
    try {
      const result = await request<{ inquiry: Inquiry }>(
        `/api/inquiries/${selected.id}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status, expectedUpdatedAt: selected.updatedAt }),
        },
      );
      setSelected(result.inquiry);
      setStatusNotice("Status updated.");
      setRefreshKey((key) => key + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const current = error.payload.inquiry as Inquiry | undefined;
        if (current) setSelected(current);
        setStatusNotice("This inquiry changed in another tab. The latest status is shown; review it before trying again.");
      } else if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setAuthState("signed_out");
      } else {
        setStatusNotice(error instanceof Error ? error.message : "Could not update the status.");
      }
    } finally {
      setStatusSaving(false);
    }
  }

  function openInquiry(id: number) {
    setSelectedId(id);
    setSelected(null);
    window.history.pushState({}, "", `?inquiry=${id}`);
  }

  function closeInquiry() {
    setSelectedId(null);
    setSelected(null);
    window.history.pushState({}, "", window.location.pathname);
  }

  if (authState === "loading") {
    return <main className="screen-message" role="status">Loading your workspace…</main>;
  }

  if (authState === "unavailable") {
    return (
      <main className="screen-message">
        <section className="message-card">
          <div className="brand-mark" aria-hidden="true">ID</div>
          <h1>Workspace unavailable</h1>
          <p>We could not reach the service. Check that the API and database are running, then try again.</p>
          <button className="button button--primary" onClick={() => window.location.reload()}>Try again</button>
        </section>
      </main>
    );
  }

  if (authState === "signed_out") {
    return (
      <main className="screen-message">
        <section className="login-card" aria-labelledby="login-title">
          <div className="brand-mark" aria-hidden="true">ID</div>
          <p className="eyebrow">CUSTOMER SUPPORT WORKSPACE</p>
          <h1 id="login-title">Welcome back</h1>
          <p className="muted-copy">Sign in with your staff account to manage customer inquiries.</p>
          <form className="stack-form" onSubmit={handleSignIn}>
            <label>
              Work email
              <input type="email" name="email" autoComplete="username" required maxLength={254} />
            </label>
            <label>
              Password
              <input type="password" name="password" autoComplete="current-password" required maxLength={200} />
            </label>
            {signInError && <p className="form-error" role="alert">{signInError}</p>}
            <button className="button button--primary button--full" type="submit" disabled={signingIn}>
              {signingIn ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Inquiry Desk home" onClick={(event) => { event.preventDefault(); closeInquiry(); }}>
          <span className="brand-mark" aria-hidden="true">ID</span>
          <span>Inquiry Desk</span>
        </a>
        <div className="account">
          {accountError && <span className="account-error" role="alert">{accountError}</span>}
          <span className="workspace-presence"><span aria-hidden="true" />Team workspace</span>
          <span className="account-avatar" aria-hidden="true">
            {user?.fullName.trim().charAt(0).toUpperCase()}
          </span>
          <span className="account-name">{user?.fullName}</span>
          <button className="button button--quiet" onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <div className="page-content">
        {selectedId !== null ? (
          <section className="detail-view" aria-labelledby="detail-title">
            <button className="back-link" onClick={closeInquiry}>← All inquiries</button>
            {detailState === "loading" && <p className="loading-state" role="status">Loading inquiry…</p>}
            {detailState === "error" && (
              <div className="empty-state" role="alert">
                <h1>Inquiry unavailable</h1>
                <p>{detailError}</p>
                <button className="button button--secondary" onClick={closeInquiry}>Back to inquiries</button>
              </div>
            )}
            {detailState === "ready" && selected && (
              <article className="detail-card">
                <div className="detail-heading">
                  <div>
                    <p className="eyebrow">INQUIRY #{selected.id}</p>
                    <h1 id="detail-title">{selected.subject}</h1>
                    <p className="muted-copy">Submitted by {selected.createdByName} · {formatDate(selected.createdAt)}</p>
                  </div>
                  <label className="status-field">
                    Status
                    <select
                      aria-label="Inquiry status"
                      value={selected.status}
                      disabled={statusSaving}
                      onChange={(event) => handleStatusChange(event.target.value as InquiryStatus)}
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option value={value} key={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {statusNotice && <p className="notice" role="status">{statusNotice}</p>}
                <dl className="detail-fields">
                  <div><dt>Customer</dt><dd>{selected.customerName}</dd></div>
                  <div><dt>Contact</dt><dd>{selected.contactMethod}</dd></div>
                  <div className="detail-description"><dt>Description</dt><dd>{selected.description}</dd></div>
                </dl>
              </article>
            )}
          </section>
        ) : (
          <>
            <section className="page-heading">
              <div>
                <p className="eyebrow"><span className="eyebrow-mark" /> CUSTOMER OPERATIONS <span className="eyebrow-divider">/</span> OVERVIEW</p>
                <h1>Every request,<br /><span>in good hands.</span></h1>
                <p className="muted-copy">A shared view of customer conversations, from first hello to resolution.</p>
              </div>
              <div className="heading-actions">
                <span className="heading-date">{new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</span>
                <button className="button button--primary" onClick={() => { setCreateError(""); setShowCreateForm(true); }}>
                  <span className="button-plus" aria-hidden="true">+</span> New inquiry
                </button>
              </div>
            </section>

            <section className="inquiry-panel" aria-label="Inquiry overview">
              <div className="panel-heading">
                <div>
                  <h2>Your inbox</h2>
                  <p>{listState === "ready" ? `${inquiries.length} ${inquiries.length === 1 ? "conversation" : "conversations"} in this view` : "Your shared team workspace"}</p>
                </div>
                <span className="shared-label"><span aria-hidden="true">✳</span> SHARED INBOX</span>
              </div>
              <div className="filters">
                <label className="search-field">
                  <span className="visually-hidden">Search inquiries</span>
                  <span className="search-icon" aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    placeholder="Search customers, subjects…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <label className="filter-field">
                  <span className="visually-hidden">Filter by status</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="all">All statuses</option>
                    <option value="new">New</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </label>
              </div>
              {listState === "loading" && <p className="loading-state" role="status">Loading inquiries…</p>}
              {listState === "error" && (
                <div className="empty-state" role="alert">
                  <h2>We couldn’t load inquiries</h2>
                  <p>{listError}</p>
                  <button className="button button--secondary" onClick={() => setRefreshKey((key) => key + 1)}>Try again</button>
                </div>
              )}
              {listState === "ready" && inquiries.length === 0 && (
                <div className="empty-state">
                  <div className="empty-illustration" aria-hidden="true">
                    <span className="empty-orbit empty-orbit--one" />
                    <span className="empty-orbit empty-orbit--two" />
                    <span className="empty-spark">✳</span>
                    <span className="empty-core">✓</span>
                  </div>
                  <h2>{search || statusFilter !== "all" ? "No matching inquiries" : "Your inbox is clear"}</h2>
                  <p>{search || statusFilter !== "all" ? "Try a different search or status filter." : "Capture the first customer request to get started."}</p>
                  {!search && statusFilter === "all" && (
                    <button className="button button--secondary" onClick={() => setShowCreateForm(true)}>Create an inquiry</button>
                  )}
                </div>
              )}
              {listState === "ready" && inquiries.length > 0 && (
                <div className="inquiry-list">
                  {inquiries.map((inquiry) => (
                    <button className="inquiry-row" key={inquiry.id} onClick={() => openInquiry(inquiry.id)}>
                      <span className="inquiry-main">
                        <span className="inquiry-subject">{inquiry.subject}</span>
                        <span className="inquiry-meta">{inquiry.customerName} <span aria-hidden="true">·</span> {inquiry.contactMethod}</span>
                      </span>
                      <span className={`status-badge status-badge--${inquiry.status}`}>{statusLabels[inquiry.status]}</span>
                      <span className="inquiry-date">{formatDate(inquiry.updatedAt)}</span>
                      <span className="row-chevron" aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {showCreateForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !savingInquiry) setShowCreateForm(false);
        }}>
          <section className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">NEW CUSTOMER REQUEST</p>
                <h2 id="create-title">Record an inquiry</h2>
              </div>
              <button className="icon-button" aria-label="Close" disabled={savingInquiry} onClick={() => setShowCreateForm(false)}>×</button>
            </div>
            <form className="stack-form" onSubmit={handleCreateInquiry}>
              <label>
                Customer name
                <input name="customerName" required maxLength={160} autoFocus />
              </label>
              <label>
                Contact details
                <input name="contactMethod" placeholder="Email or phone" required maxLength={254} />
              </label>
              <label>
                Subject
                <input name="subject" required maxLength={200} />
              </label>
              <label>
                Description
                <textarea name="description" rows={4} required maxLength={5000} />
              </label>
              {createError && <p className="form-error" role="alert">{createError}</p>}
              <div className="form-actions">
                <button className="button button--secondary" type="button" disabled={savingInquiry} onClick={() => setShowCreateForm(false)}>Cancel</button>
                <button className="button button--primary" type="submit" disabled={savingInquiry}>
                  {savingInquiry ? "Saving…" : "Save inquiry"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function readInquiryId(): number | null {
  const rawId = new URLSearchParams(window.location.search).get("inquiry");
  if (rawId === null) return null;
  if (!/^[1-9]\d*$/.test(rawId)) return Number.NaN;

  const id = Number(rawId);
  return Number.isSafeInteger(id) ? id : Number.NaN;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default App;
