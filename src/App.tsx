import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowDownUp,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Bell,
  Download,
  Eye,
  FileText,
  Gauge,
  History,
  KeyRound,
  LifeBuoy,
  LayoutDashboard,
  LogOut,
  MessageSquarePlus,
  Pencil,
  Plus,
  Search,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { AdminPermissions, ClientDirectoryEntry, Customer, ImportBatch, Issue, IssuePriority, IssueStatus, PortalUser, Role, Transaction, TransactionStatus } from "./types";
import { AppState, clearLegacyPortalState, defaultState, makeId } from "./services/store";
import { isSupabaseConfigured } from "./lib/supabase";
import {
  getSupabaseSession,
  onSupabaseAuthChange,
  signInWithPassword,
  signOutFromSupabase,
} from "./services/supabaseAuth";
import { loadPortalData } from "./services/portalData";
import {
  completeRequiredPasswordChange,
  createPortalUser,
  deactivatePortalUser,
  resetPortalUserPassword,
  updatePortalUser,
} from "./services/portalUsers";
import {
  createIssue,
  deleteTransaction,
  importTransactions,
  saveTransaction,
  updateIssue,
  writeActivityLog,
} from "./services/portalOperations";

const LOGO_URL = "https://fuelsearch.co.za/wp-content/uploads/Logo.svg";
const STATUSES: TransactionStatus[] = ["Completed", "Pending", "Open", "Expired", "Cancelled"];
const ISSUE_STATUSES: IssueStatus[] = ["Open", "In Progress", "Resolved"];
const ISSUE_PRIORITIES: IssuePriority[] = ["Low", "Medium", "High", "Urgent"];

function money(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "-";
  return `R ${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function number(value?: number | null, digits = 1) {
  if (value == null || Number.isNaN(value)) return "-";
  return value.toLocaleString("en-ZA", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function shortDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(2)}`;
}

function dateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${shortDate(value)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const DEFAULT_ADMIN_PERMISSIONS: AdminPermissions = {
  manageTransactions: true,
  manageUsers: false,
  manageSupport: true,
  viewActivityLog: false,
};

type AdminPermissionKey = keyof AdminPermissions;

const ADMIN_PERMISSION_FIELDS: Array<{ key: AdminPermissionKey; label: string; help: string }> = [
  { key: "manageTransactions", label: "Manage transactions", help: "Import, edit, and export transactions." },
  { key: "manageUsers", label: "Manage users", help: "Create, edit, and remove portal users." },
  { key: "manageSupport", label: "Manage support", help: "View and update support requests." },
  { key: "viewActivityLog", label: "View activity log", help: "See portal audit history." },
] as const;

function isCustomerRole(role?: Role | null) {
  return role === "customer";
}

function isAdminRole(role?: Role | null) {
  return role === "admin" || role === "super_admin";
}

function isSuperAdminRole(role?: Role | null) {
  return role === "super_admin";
}

function getSignedInAdmin(state: AppState) {
  if (!state.currentUser || isCustomerRole(state.currentUser.role)) return undefined;
  return state.customers.find((customer) => customer.email === state.currentUser?.email && isAdminRole(customer.role));
}

function resolveAdminPermissions(customer?: Customer) {
  if (!customer || !isAdminRole(customer.role)) return null;
  if (isSuperAdminRole(customer.role)) {
    return { manageTransactions: true, manageUsers: true, manageSupport: true, viewActivityLog: true };
  }
  return { ...DEFAULT_ADMIN_PERMISSIONS, ...(customer.adminPermissions ?? {}) };
}

function summarizePermissions(customer?: Customer) {
  const permissions = resolveAdminPermissions(customer);
  if (!permissions) return "Customer";
  if (isSuperAdminRole(customer?.role)) return "Full access";
  const labels = ADMIN_PERMISSION_FIELDS.filter(({ key }) => permissions[key]).map(({ label }) => label);
  return labels.length > 0 ? labels.join(", ") : "Limited access";
}

function normalizeAdminPermissions(permissions?: Partial<AdminPermissions> | null) {
  return {
    ...DEFAULT_ADMIN_PERMISSIONS,
    ...(permissions ?? {}),
  };
}

function buildCustomerAuditDetails(customer: Customer) {
  return `${customer.email} · ${formatRole(customer.role)} · ${summarizePermissions(customer)}`;
}

function formatRole(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isAfter(value?: string, reference?: string) {
  if (!value) return false;
  if (!reference) return true;
  const current = new Date(value);
  const pivot = new Date(reference);
  if (Number.isNaN(current.getTime()) || Number.isNaN(pivot.getTime())) return false;
  return current > pivot;
}

function monthKey(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function txType(tx: Transaction) {
  const fuel = (tx.filledFuelL ?? tx.requestedFuelL ?? 0) > 0;
  const parking = (tx.parkingFee ?? 0) > 0;
  if (fuel && parking) return "Fuel + Parking";
  if (parking) return "Parking";
  return "Fuel";
}

function normalizeHeader(header: string) {
  return header.trim().replace(/\s+/g, " ");
}

function parseNumber(value: unknown) {
  if (value == null || value === "") return undefined;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDateValue(value: unknown) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const raw = String(value).trim();
  const spaced = raw.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/, "$1T$2");
  const parsed = new Date(spaced);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

async function parseWorkbookRows(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function mapImportRows(rows: Record<string, unknown>[]): Transaction[] {
  return rows
    .map((source) => {
      const row: Record<string, unknown> = {};
      Object.entries(source).forEach(([key, value]) => {
        row[normalizeHeader(key)] = value;
      });
      const order = String(row["Order #"] ?? "").trim();
      if (!order) return null;
      return {
        id: makeId("tx"),
        order,
        clientName: String(row.Client ?? "").trim() || "Unknown Client",
        depot: String(row.Depot ?? "").trim(),
        vehicle: String(row.Vehicle ?? "").trim(),
        vehicleOdoReading: parseNumber(row["Vehicle ODO Reading"]),
        driver: String(row.Driver ?? "").trim() || undefined,
        status: (String(row.Status ?? "Pending").trim() || "Pending") as TransactionStatus,
        requestedFuelL: parseNumber(row["Requested Fuel (L)"]),
        filledFuelL: parseNumber(row["Filled Fuel (L)"]),
        parkingNights: parseNumber(row["Parking Nights"]),
        nightsActual: parseNumber(row["Nights Actual"]),
        parkingFee: parseNumber(row["Parking Fee"]),
        parkingCostPrice: parseNumber(row["Parking Cost Price"]),
        costPricePerL: parseNumber(row["Cost Price (per L)"]),
        fuelPricePerL: parseNumber(row["Fuel Price (per L)"]),
        totalCostPrice: parseNumber(row["Total Cost Price"]),
        totalPrice: parseNumber(row["Total Price"]) ?? 0,
        profit: parseNumber(row.Profit),
        createdBy: String(row["Created By"] ?? "").trim() || undefined,
        createdAt: parseDateValue(row["Created At"]) ?? new Date().toISOString(),
        completedAt: parseDateValue(row["Completed At"]),
        expiresAt: parseDateValue(row["Expires At"]),
      } satisfies Transaction;
    })
    .filter(Boolean) as Transaction[];
}

function StatusBadge({ status }: { status: TransactionStatus | IssueStatus | Role }) {
  return <span className={`badge badge-${status.toLowerCase().replace(/\s+/g, "-").replace(/_/g, "-")}`}>{formatRole(status)}</span>;
}

function IconButton({ label, onClick, children, danger = false }: { label: string; onClick?: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button className={`icon-button ${danger ? "danger" : ""}`} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal ${wide ? "modal-wide" : ""}`}>
        <header className="modal-head">
          <h2>{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        {children}
      </div>
    </div>
  );
}

function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [signedInUser, setSignedInUser] = useState<PortalUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  const update = (next: Partial<AppState>) => setState((current) => ({ ...current, ...next }));
  const hydrateSupabaseUser = useCallback(async (user: User) => {
    try {
      const portalData = await loadPortalData(user);
      setState((current) => ({ ...current, ...portalData }));
      setSignedInUser(portalData.currentUser);
      setAuthError("");
    } catch (error) {
      setState((current) => ({ ...current, currentUser: null }));
      setSignedInUser(null);
      setAuthError(error instanceof Error ? error.message : "Could not load your portal account.");
      await signOutFromSupabase().catch(() => undefined);
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    clearLegacyPortalState();

    if (!isSupabaseConfigured) {
      setAuthError("Portal configuration is incomplete. Please contact FuelSearch support.");
      setAuthReady(true);
      return;
    }

    let active = true;
    void getSupabaseSession()
      .then((session) => {
        if (!active) return;
        if (session?.user) {
          void hydrateSupabaseUser(session.user);
          return;
        }
        setState((current) => ({ ...current, currentUser: null }));
        setAuthReady(true);
      })
      .catch((error) => {
        if (!active) return;
        setAuthError(error instanceof Error ? error.message : "Could not restore your session.");
        setAuthReady(true);
      });

    const unsubscribe = onSupabaseAuthChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        void hydrateSupabaseUser(session.user);
      } else {
        setState((current) => ({ ...current, currentUser: null }));
        setAuthReady(true);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [hydrateSupabaseUser]);

  const logout = async () => {
    await signOutFromSupabase();
    setState(defaultState);
    setSignedInUser(null);
  };

  const previewAs = (user: PortalUser) => update({ currentUser: user });
  const exitPreview = () => {
    if (signedInUser) update({ currentUser: signedInUser });
  };
  const isPreviewing = Boolean(signedInUser && state.currentUser && signedInUser.id !== state.currentUser.id);

  if (!authReady) {
    return (
      <main className="login-screen">
        <section className="login-panel login-loading" aria-live="polite">
          <img src={LOGO_URL} alt="FuelSearch" className="login-logo" />
          <div className="auth-spinner" />
          <h1>Opening your portal</h1>
          <p className="login-copy">Checking your secure session and loading your statement.</p>
        </section>
      </main>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          state.currentUser ? (
            <Navigate
              to={state.currentUser.mustChangePassword ? "/change-password" : isCustomerRole(state.currentUser.role) ? "/statement" : "/admin"}
              replace
            />
          ) : (
            <LoginPage authError={authError} clearAuthError={() => setAuthError("")} />
          )
        }
      />
      <Route
        path="/change-password"
        element={
          state.currentUser?.mustChangePassword ? (
            <RequiredPasswordChangePage
              onComplete={() => {
                setState((current) => ({
                  ...current,
                  currentUser: current.currentUser
                    ? { ...current.currentUser, mustChangePassword: false }
                    : null,
                }));
                setSignedInUser((current) => current ? { ...current, mustChangePassword: false } : null);
              }}
            />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/statement"
        element={
          state.currentUser?.role === "customer" && !state.currentUser.mustChangePassword ? (
            <StatementPage state={state} update={update} logout={logout} exitPreview={isPreviewing ? exitPreview : undefined} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route
        path="/admin/*"
        element={
          state.currentUser && !state.currentUser.mustChangePassword && !isCustomerRole(state.currentUser.role) ? (
            <AdminLayout
              state={state}
              update={update}
              logout={logout}
              signedInUser={signedInUser}
              previewAs={previewAs}
              exitPreview={isPreviewing ? exitPreview : undefined}
            />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function authErrorMessage(error: unknown, fallback: string) {
  const detail = error instanceof Error ? error.message : "";
  if (/invalid login credentials/i.test(detail)) {
    return "The email or password is incorrect.";
  }
  if (/email not confirmed/i.test(detail)) {
    return "Confirm this email address before signing in.";
  }
  if (/rate limit|over_email_send_rate_limit/i.test(detail)) {
    return "Too many email requests were made. Please wait a few minutes and try again.";
  }
  return detail || fallback;
}

function LoginPage({ authError, clearAuthError }: { authError: string; clearAuthError: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submitCredentials = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    clearAuthError();
    if (!isSupabaseConfigured) {
      setError("Portal configuration is incomplete. Please contact FuelSearch support.");
      setSubmitting(false);
      return;
    }
    try {
      await signInWithPassword(email.trim(), password);
    } catch (requestError) {
      setError(authErrorMessage(
        requestError,
        "Could not sign in.",
      ));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-panel">
        <img src={LOGO_URL} alt="FuelSearch" className="login-logo" />
        <p className="eyebrow">Client Portal</p>
        <h1>Welcome back.</h1>
        <p className="login-copy">
          Sign in with the email and password linked to your FuelSearch account.
        </p>

        <form className="auth-form" onSubmit={submitCredentials}>
          <label htmlFor="portal-email">Email address</label>
          <input
            id="portal-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.co.za"
            required
          />
          <label htmlFor="portal-password">Password</label>
          <input
            id="portal-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <button className="button primary auth-submit" type="submit" disabled={submitting}>
            <KeyRound size={18} />
            {submitting ? "Signing in..." : "Sign in"}
          </button>
          {(error || authError) && <p className="auth-message auth-error" role="alert">{error || authError}</p>}
          <p className="auth-footnote">Contact a FuelSearch administrator if you need a new temporary password.</p>
          <p className="auth-footnote">Portal access remains limited to users approved by FuelSearch.</p>
        </form>
      </section>
    </main>
  );
}

function RequiredPasswordChangePage({ onComplete }: { onComplete: () => void }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (password.length < 12) {
      setError("Use at least 12 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await completeRequiredPasswordChange(password);
      onComplete();
      navigate("/", { replace: true });
    } catch (changeError) {
      setError(authErrorMessage(changeError, "Could not update your password."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-panel">
        <img src={LOGO_URL} alt="FuelSearch" className="login-logo" />
        <p className="eyebrow">First sign-in</p>
        <h1>Create your permanent password.</h1>
        <p className="login-copy">Replace the temporary password before continuing to the portal.</p>
        <form className="auth-form" onSubmit={savePassword}>
          <input type="text" name="username" autoComplete="username" hidden />
          <label htmlFor="required-new-password">New password</label>
          <input
            id="required-new-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <label htmlFor="required-confirm-password">Confirm new password</label>
          <input
            id="required-confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
          <button className="button primary auth-submit" type="submit" disabled={submitting}>
            <KeyRound size={18} /> {submitting ? "Saving..." : "Set permanent password"}
          </button>
          {error && <p className="auth-message auth-error" role="alert">{error}</p>}
        </form>
      </section>
    </main>
  );
}

function StatementPage({ state, update, logout, exitPreview }: { state: AppState; update: (next: Partial<AppState>) => void; logout: () => void; exitPreview?: () => void }) {
  const [status, setStatus] = useState<TransactionStatus | "All">("Completed");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [visible, setVisible] = useState(20);
  const [invoiceTx, setInvoiceTx] = useState<Transaction | null>(null);
  const [issueTx, setIssueTx] = useState<Transaction | null>(null);
  const [issueError, setIssueError] = useState("");
  const availableClients = state.clientDirectory.map((client) => client.clientName);
  const [clientName, setClientName] = useState(
    state.currentUser?.clientName ?? availableClients[0] ?? "",
  );
  const customer = state.customers.find((item) => item.clientName === clientName);
  const customerTx = state.transactions.filter((tx) => tx.clientName === clientName);
  const months = Array.from(new Set(customerTx.map((tx) => monthKey(tx.createdAt)).filter(Boolean))).sort().reverse();
  const [selectedMonth, setSelectedMonth] = useState(months[0] ?? "");

  useEffect(() => {
    if (months.length > 0 && !months.includes(selectedMonth)) {
      setSelectedMonth(months[0]);
    }
  }, [clientName, months, selectedMonth]);

  const monthTx = customerTx.filter((tx) => monthKey(tx.createdAt) === selectedMonth);
  const statusCounts = {
    Completed: monthTx.filter((tx) => tx.status === "Completed").length,
    Cancelled: monthTx.filter((tx) => tx.status === "Cancelled").length,
    Expired: monthTx.filter((tx) => tx.status === "Expired").length,
    Pending: monthTx.filter((tx) => tx.status === "Pending").length,
    All: monthTx.length,
  };
  const filtered = monthTx
    .filter((tx) => status === "All" || tx.status === status)
    .sort((a, b) => (sort === "newest" ? +new Date(b.createdAt) - +new Date(a.createdAt) : +new Date(a.createdAt) - +new Date(b.createdAt)));
  const shown = filtered.slice(0, visible);
  const completed = monthTx.filter((tx) => tx.status === "Completed");
  const totalLitres = completed.reduce((sum, tx) => sum + (tx.filledFuelL ?? 0), 0);
  const totalAmount = completed.reduce((sum, tx) => sum + tx.totalPrice, 0);

  const reportIssue = async (payload: { title: string; description: string; category: string; priority: IssuePriority; orderRef?: string }) => {
    const now = new Date().toISOString();
    const draft: Issue = {
      id: makeId("issue"),
      status: "Open",
      reportedBy: clientName,
      source: "Customer Statement",
      loggedAt: now,
      updatedAt: now,
      ...payload,
    };
    setIssueError("");
    try {
      const saved = await createIssue(draft);
      update({ issues: [saved, ...state.issues] });
      setIssueTx(null);
    } catch (error) {
      setIssueError(error instanceof Error ? error.message : "Could not submit the request.");
    }
  };

  return (
    <main className="statement-page">
      <header className="statement-top">
        <div>
          <img src={LOGO_URL} alt="FuelSearch" className="brand-logo" />
          <small>Reg No: 2022/776599/07</small>
        </div>
        <div className="top-actions">
          <strong>Hi, {state.currentUser?.displayName}</strong>
          {exitPreview && <button className="button ghost" onClick={exitPreview}><Shield size={16} /> Return to Super Admin</button>}
          <button className="button dark" onClick={logout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>
      <section className="content">
        <div className="page-title-row">
          <div className="title-cluster">
            <div className="title-icon"><Building2 size={22} /></div>
            <div>
              {availableClients.length > 1 ? (
                <select className="client-switcher" value={clientName} onChange={(event) => setClientName(event.target.value)}>
                  {availableClients.map((name) => <option key={name}>{name}</option>)}
                </select>
              ) : (
                <h1>{clientName}</h1>
              )}
              <p>Statement of Account</p>
            </div>
          </div>
          <button className="button outline" onClick={() => setIssueTx({ ...monthTx[0], order: "" })}>
            <LifeBuoy size={16} /> Support & Requests
          </button>
        </div>
        <div className="summary-grid">
          <SummaryCard icon={<Gauge />} label={`Litres - ${monthLabel(selectedMonth)}`} value={`${number(totalLitres)} L`} />
          <SummaryCard icon={<FileText />} label={`Total - ${monthLabel(selectedMonth)}`} value={money(totalAmount)} />
          <SummaryCard icon={<ClipboardList />} label={`Orders - ${monthLabel(selectedMonth)}`} value={String(completed.length)} />
        </div>
        <div className="toolbar">
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
            {months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
          </select>
          <button className="button outline" onClick={() => setSort((value) => (value === "newest" ? "oldest" : "newest"))}>
            <ArrowDownUp size={16} /> {sort === "newest" ? "Newest first" : "Oldest first"}
          </button>
          <button className="button outline push-right" onClick={() => downloadCsv(shown)}>
            <Download size={16} /> Download CSV Statement
          </button>
        </div>
        <div className="tabs">
          {(["Completed", "Cancelled", "Expired", "Pending", "All"] as const).map((item) => (
            <button key={item} className={status === item ? "active" : ""} onClick={() => setStatus(item)}>
              {item} <span>{statusCounts[item]}</span>
            </button>
          ))}
        </div>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Invoice</th><th>Date</th><th>Type</th><th>Order #</th><th>Vehicle</th><th>ODO</th><th>Depot</th><th>R/pL</th><th>Litres</th><th>Amount</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((tx, index) => (
                <tr key={tx.id}>
                  <td>{index + 1}</td>
                  <td><button className="mini-button" onClick={() => setInvoiceTx(tx)}><FileText size={14} /> View</button></td>
                  <td>{shortDate(tx.createdAt)}</td>
                  <td><span className="type-pill">{txType(tx)}</span></td>
                  <td className="mono">{tx.order}</td>
                  <td>{tx.vehicle}</td>
                  <td>{number(tx.vehicleOdoReading, 0)}</td>
                  <td className="truncate">{tx.depot}</td>
                  <td>R{number(tx.fuelPricePerL, 2)}</td>
                  <td>{number(tx.filledFuelL)} L</td>
                  <td className="strong">{money(tx.totalPrice)}</td>
                  <td><StatusBadge status={tx.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <footer className="table-footer">
            <span>Period Totals</span><strong>{number(totalLitres)} L</strong><strong>{money(totalAmount)}</strong>
          </footer>
        </div>
        {filtered.length > visible && <button className="button outline centered" onClick={() => setVisible((count) => count + 20)}><ChevronDown size={16} /> Load More ({filtered.length - visible} remaining)</button>}
      </section>
      {invoiceTx && <InvoiceModal tx={invoiceTx} customer={customer} onClose={() => setInvoiceTx(null)} onReport={() => setIssueTx(invoiceTx)} />}
      {issueError && <p className="auth-message auth-error statement-action-error" role="alert">{issueError}</p>}
      {issueTx && <IssueDialog tx={issueTx.order ? issueTx : undefined} onClose={() => setIssueTx(null)} onSubmit={(payload) => void reportIssue(payload)} />}
    </main>
  );
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article className="summary-card">
      <div className="summary-icon">{icon}</div>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

function InvoiceModal({ tx, customer, onClose, onReport }: { tx: Transaction; customer?: Customer; onClose: () => void; onReport: () => void }) {
  const invoiceNumber = `INV-${tx.order}`;
  const fuelAmount = (tx.filledFuelL ?? 0) * (tx.fuelPricePerL ?? 0);
  return (
    <Modal title={`Invoice #${invoiceNumber}`} onClose={onClose} wide>
      <div className="invoice-toolbar">
        <button className="button outline danger" onClick={onReport}><LifeBuoy size={16} /> Get Support</button>
        <button className="button primary" onClick={() => window.print()}><Download size={16} /> Download PDF</button>
      </div>
      <div className="invoice-paper">
        <header className="invoice-head">
          <div>
            <img src={LOGO_URL} alt="FuelSearch" />
            <strong>FuelSearch (Pty) Ltd</strong>
            <p>Clearwater Office Park, 1 Atlas Rd<br />Parkhaven, Boksburg, 1459<br />info@fuelsearch.co.za · +27 74 1199 787</p>
          </div>
          <div className="invoice-word">INVOICE<br /><span>#{invoiceNumber}</span></div>
        </header>
        <section className="invoice-meta">
          <div><small>Bill To</small><h3>{tx.clientName}</h3><p>{customer?.address ?? "Street"}</p></div>
          <div><small>Details</small><p>Date <strong>{shortDate(tx.createdAt)}</strong></p><p>Order <strong>{tx.order}</strong></p><p>Vehicle <strong>{tx.vehicle}</strong></p><p>Depot <strong>{tx.depot}</strong></p><p>Driver <strong>{tx.driver ?? "-"}</strong></p></div>
        </section>
        <table className="invoice-lines">
          <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
          <tbody>
            {(tx.filledFuelL ?? 0) > 0 && <tr><td><strong>Usage</strong><br /><span>{tx.vehicle} · {tx.depot}</span></td><td>{number(tx.filledFuelL)} L</td><td>R {number(tx.fuelPricePerL, 2)}/L</td><td>{money(fuelAmount)}</td></tr>}
            {(tx.parkingFee ?? 0) > 0 && <tr><td><strong>Parking Fee</strong></td><td>-</td><td>-</td><td>{money(tx.parkingFee)}</td></tr>}
            <tr className="muted-line"><td colSpan={3}>VAT - 0%</td><td>R 0.00</td></tr>
          </tbody>
          <tfoot><tr><td colSpan={3}>TOTAL DUE</td><td>{money(tx.totalPrice)}</td></tr></tfoot>
        </table>
        <section className="banking">
          <h4>Banking Details</h4>
          {["FNB 63026817544", "NEDBANK 1238798306", "ABSA 4105937663", "STANDARD BANK 10184309490"].map((bank) => <div key={bank}>{bank}<br /><span>Name: FUELSEARCH</span></div>)}
        </section>
      </div>
    </Modal>
  );
}

function IssueDialog({ tx, onClose, onSubmit }: { tx?: Transaction; onClose: () => void; onSubmit: (payload: { title: string; description: string; category: string; priority: IssuePriority; orderRef?: string }) => void }) {
  const [title, setTitle] = useState(tx?.order ? `Help with ${tx.order}` : "");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(tx ? "Invoice / Statement Question" : "Problem / Bug");
  const [priority, setPriority] = useState<IssuePriority>("Medium");
  return (
    <Modal title="Support & Requests" onClose={onClose}>
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSubmit({ title, description, category, priority, orderRef: tx?.order }); }}>
        <p className="form-intro">Report a problem, request a correction, or suggest a feature or portal update.</p>
        <label>Request Type<select value={category} onChange={(event) => setCategory(event.target.value)}><option>Problem / Bug</option><option>Data Correction</option><option>Invoice / Statement Question</option><option>Feature Request</option><option>Update Request</option><option>Login / Access</option></select></label>
        <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Briefly describe what you need" required /></label>
        <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as IssuePriority)}>{ISSUE_PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Details<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} placeholder="Include what happened, what you expected, or what you would like added or changed." required /></label>
        <div className="modal-actions"><button className="button outline" type="button" onClick={onClose}>Cancel</button><button className="button primary" type="submit">Submit Request</button></div>
      </form>
    </Modal>
  );
}

function AdminLayout({
  state,
  update,
  logout,
  signedInUser,
  previewAs,
  exitPreview,
}: {
  state: AppState;
  update: (next: Partial<AppState>) => void;
  logout: () => void;
  signedInUser: PortalUser | null;
  previewAs: (user: PortalUser) => void;
  exitPreview?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const currentAdmin = getSignedInAdmin(state);
  const permissions = resolveAdminPermissions(currentAdmin);
  const canManageTransactions = !!currentAdmin && (isSuperAdminRole(currentAdmin.role) || !!permissions?.manageTransactions);
  const canManageUsers = !!currentAdmin && (isSuperAdminRole(currentAdmin.role) || !!permissions?.manageUsers);
  const canManageSupport = !!currentAdmin && (isSuperAdminRole(currentAdmin.role) || !!permissions?.manageSupport);
  const canViewActivityLog = !!currentAdmin && (isSuperAdminRole(currentAdmin.role) || !!permissions?.viewActivityLog);
  const canPreviewUsers = isSuperAdminRole(signedInUser?.role);
  const previewUsers = state.customers
    .filter((customer) => customer.email !== signedInUser?.email)
    .map<PortalUser>((customer) => ({
      id: customer.id,
      email: customer.email,
      displayName: customer.displayName,
      role: customer.role,
      clientName: customer.role === "customer" ? customer.clientName : undefined,
    }));
  const unreadSupportCount = useMemo(
    () => state.issues.filter((issue) => isAfter(issue.loggedAt, state.supportNotificationsSeenAt)).length,
    [state.issues, state.supportNotificationsSeenAt],
  );
  const unreadCustomerCount = useMemo(
    () => state.issues.filter((issue) => isAfter(issue.loggedAt, state.supportNotificationsSeenAt) && issue.source === "Customer Statement").length,
    [state.issues, state.supportNotificationsSeenAt],
  );
  const unreadAdminCount = useMemo(
    () => state.issues.filter((issue) => isAfter(issue.loggedAt, state.supportNotificationsSeenAt) && issue.source === "Admin Portal").length,
    [state.issues, state.supportNotificationsSeenAt],
  );
  const recentSupportAlerts = useMemo(
    () => [...state.issues].sort((a, b) => +new Date(b.loggedAt) - +new Date(a.loggedAt)).slice(0, 5),
    [state.issues],
  );
  const markSupportAlertsRead = () => update({ supportNotificationsSeenAt: new Date().toISOString() });

  useEffect(() => {
    if (location.pathname === "/admin/issues" && unreadSupportCount > 0) {
      markSupportAlertsRead();
    }
  }, [location.pathname, unreadSupportCount]);

  return (
    <main className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><img src={LOGO_URL} alt="FuelSearch" /><span>Admin Portal</span></div>
        <nav>
          <NavLink end to="/admin"><LayoutDashboard size={18} /> Dashboard</NavLink>
          {canManageTransactions && <NavLink to="/admin/transactions"><FileText size={18} /> Transactions</NavLink>}
          {canManageUsers && <NavLink to="/admin/customers"><Users size={18} /> Users</NavLink>}
          {canManageSupport && (
            <NavLink to="/admin/issues">
              <span className="nav-link-main"><LifeBuoy size={18} /> Support & Requests</span>
              {unreadSupportCount > 0 && <span className="nav-badge">{unreadSupportCount > 99 ? "99+" : unreadSupportCount}</span>}
            </NavLink>
          )}
        </nav>
        <div className="sidebar-user">
          <div><strong>{currentAdmin?.displayName ?? state.currentUser?.displayName ?? "Admin"}</strong><span>{currentAdmin?.email ?? state.currentUser?.email ?? ""}</span></div>
          {canPreviewUsers && previewUsers.length > 0 && (
            <label className="preview-user-control">
              <span>Preview portal as</span>
              <select
                value={exitPreview ? state.currentUser?.id : ""}
                onChange={(event) => {
                  const selected = previewUsers.find((user) => user.id === event.target.value);
                  if (selected) {
                    previewAs(selected);
                    navigate(selected.role === "customer" ? "/statement" : "/admin");
                  }
                }}
              >
                <option value="">Choose a user...</option>
                {previewUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName} ({formatRole(user.role)})</option>)}
              </select>
            </label>
          )}
          {exitPreview && <button className="button outline" onClick={exitPreview}>Exit preview</button>}
          {canViewActivityLog ? <Link className="icon-button" to="/admin/activity-log" title="Activity Log"><ClipboardList size={16} /></Link> : <span />}
          <button className="button sidebar-logout" onClick={logout}><LogOut size={16} /> Logout</button>
        </div>
      </aside>
      <section className="admin-content">
        {canManageSupport && (
          <div className="admin-topbar">
          <div className="notification-wrap">
            <button
              type="button"
              className="icon-button notification-button"
              aria-label={`Support alerts ${unreadSupportCount > 0 ? `${unreadSupportCount} unread` : "none"}`}
              onClick={() => setNotificationsOpen((current) => !current)}
            >
              <Bell size={16} />
              {unreadSupportCount > 0 && <span className="notification-badge">{unreadSupportCount > 9 ? "9+" : unreadSupportCount}</span>}
            </button>
            {notificationsOpen && (
              <div className="notification-panel" role="dialog" aria-label="Support alerts">
                <header className="notification-panel-head">
                  <div>
                    <strong>Support alerts</strong>
                    <p>{unreadSupportCount} unread request{unreadSupportCount === 1 ? "" : "s"}</p>
                  </div>
                  <button type="button" className="icon-button" aria-label="Close notifications" onClick={() => setNotificationsOpen(false)}>
                    <X size={14} />
                  </button>
                </header>
                <div className="notification-summary">
                  <span className="notification-chip">Customer {unreadCustomerCount}</span>
                  <span className="notification-chip">Admin {unreadAdminCount}</span>
                </div>
                <div className="notification-list">
                  {recentSupportAlerts.map((issue) => {
                    const unread = isAfter(issue.loggedAt, state.supportNotificationsSeenAt);
                    return (
                      <button
                        key={issue.id}
                        type="button"
                        className={`notification-item ${unread ? "unread" : ""}`}
                        onClick={() => {
                          update({ supportNotificationsSeenAt: new Date().toISOString() });
                          setNotificationsOpen(false);
                          navigate("/admin/issues");
                        }}
                      >
                        <div className={`notification-dot ${issue.source === "Admin Portal" ? "admin" : "customer"}`} aria-hidden="true" />
                        <div className="notification-item-copy">
                          <strong>{issue.title}</strong>
                          <p>{issue.source} · {issue.category}</p>
                        </div>
                        <small>{dateTime(issue.loggedAt)}</small>
                      </button>
                    );
                  })}
                </div>
                <footer className="notification-panel-foot">
                  <button
                    type="button"
                    className="button outline"
                    onClick={() => {
                      markSupportAlertsRead();
                      setNotificationsOpen(false);
                      navigate("/admin/issues");
                    }}
                  >
                    Open Support & Requests
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      markSupportAlertsRead();
                      setNotificationsOpen(false);
                    }}
                  >
                    Mark all as read
                  </button>
                </footer>
              </div>
            )}
          </div>
          </div>
        )}
        <Routes>
          <Route index element={<Dashboard state={state} />} />
          <Route path="transactions" element={canManageTransactions ? <TransactionsAdmin state={state} update={update} /> : <Navigate to="/admin" replace />} />
          <Route
            path="customers"
            element={
              canManageUsers ? (
                <CustomersAdmin
                  state={state}
                  update={update}
                  canPreviewUsers={canPreviewUsers}
                  previewAs={previewAs}
                />
              ) : (
                <Navigate to="/admin" replace />
              )
            }
          />
          <Route path="issues" element={canManageSupport ? <IssuesAdmin state={state} update={update} /> : <Navigate to="/admin" replace />} />
          <Route path="help" element={<Navigate to="/admin" replace />} />
          <Route path="activity-log" element={canViewActivityLog ? <ActivityLogPage state={state} /> : <Navigate to="/admin" replace />} />
        </Routes>
      </section>
    </main>
  );
}

function Dashboard({ state }: { state: AppState }) {
  const [visibleTransactions, setVisibleTransactions] = useState(10);
  const visibleUsers = state.customers.filter((customer) => customer.role !== "super_admin");
  const admins = visibleUsers.filter((customer) => customer.role === "admin").length;
  const customers = visibleUsers.filter((customer) => customer.role === "customer").length;
  const recentTransactions = state.transactions.slice(0, visibleTransactions);
  const remainingTransactions = Math.max(0, state.transactions.length - visibleTransactions);
  return (
    <div className="page-stack dashboard-page">
      <h1>Dashboard</h1>
      <div className="dashboard-card">
        <div className="title-icon"><Users size={22} /></div>
        <div><p>Total Users Added to Portal</p><strong>{visibleUsers.length}</strong><span><Shield size={15} /> {admins} Admins</span><span><Users size={15} /> {customers} Customers</span></div>
      </div>
      <section className="table-card dashboard-transactions">
        <div className="section-head"><div><h2>Recently Imported Transactions</h2><p>Latest transactions across all statuses - updates on import</p></div></div>
        <SimpleTxTable transactions={recentTransactions} numbered />
        {remainingTransactions > 0 && (
          <div className="load-more-row">
            <button className="button outline" onClick={() => setVisibleTransactions((count) => count + 5)}>
              <ChevronDown size={16} /> Load More ({remainingTransactions} remaining)
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function SimpleTxTable({ transactions, numbered = false }: { transactions: Transaction[]; numbered?: boolean }) {
  return (
    <table>
      <thead><tr>{numbered && <th className="number-column">#</th>}<th>Order #</th><th>Client / Depot</th><th>Filled (L)</th><th>Total Price</th><th>Status</th><th>Created At</th></tr></thead>
      <tbody>{transactions.map((tx, index) => <tr key={tx.id}>{numbered && <td className="number-column">{index + 1}</td>}<td className="mono">{tx.order}</td><td><strong>{tx.clientName}</strong><br /><span>{tx.depot}</span></td><td>{number(tx.filledFuelL)} L</td><td className="strong">{money(tx.totalPrice)}</td><td><StatusBadge status={tx.status} /></td><td>{dateTime(tx.createdAt)}</td></tr>)}</tbody>
    </table>
  );
}

function TransactionsAdmin({ state, update }: { state: AppState; update: (next: Partial<AppState>) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TransactionStatus | "All">("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [visibleTransactions, setVisibleTransactions] = useState(5);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const [viewing, setViewing] = useState<Transaction | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [operationError, setOperationError] = useState("");
  const filtered = state.transactions
    .filter((tx) => {
      const created = tx.createdAt.slice(0, 10);
      return (!search || tx.clientName.toLowerCase().includes(search.toLowerCase())) && (status === "All" || tx.status === status) && (!from || created >= from) && (!to || created <= to);
    })
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const shownTransactions = filtered.slice(0, visibleTransactions);
  const remainingTransactions = Math.max(0, filtered.length - visibleTransactions);

  useEffect(() => {
    setVisibleTransactions(10);
  }, [search, status, from, to, state.transactions.length]);
  const saveTx = async (tx: Transaction) => {
    setOperationError("");
    try {
      const id = await saveTransaction(tx);
      const saved = { ...tx, id };
      const exists = state.transactions.some((item) => item.id === tx.id);
      update({ transactions: exists ? state.transactions.map((item) => item.id === tx.id ? saved : item) : [saved, ...state.transactions] });
      void writeActivityLog(exists ? "Updated transaction" : "Created transaction", `${saved.order} · ${saved.clientName}`).catch(() => undefined);
      setEditing(null);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "Could not save the transaction.");
    }
  };
  const removeTransaction = async (tx: Transaction) => {
    if (!window.confirm(`Delete transaction ${tx.order}?`)) return;
    setOperationError("");
    try {
      await deleteTransaction(tx.id);
      update({ transactions: state.transactions.filter((item) => item.id !== tx.id) });
      void writeActivityLog("Deleted transaction", `${tx.order} · ${tx.clientName}`).catch(() => undefined);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "Could not delete the transaction.");
    }
  };
  return (
    <div className="page-stack">
      <div className="page-title-row"><h1>Transactions</h1><div className="row-actions"><button className="button outline" onClick={() => setImportOpen(true)}><Upload size={16} /> Import</button><button className="button outline" onClick={() => setHistoryOpen(true)}><History size={16} /> Import History</button><button className="button primary" onClick={() => setEditing("new")}><Plus size={16} /> Add Manually</button></div></div>
      {operationError && <p className="auth-message auth-error" role="alert">{operationError}</p>}
      <div className="filters"><label><Search size={16} /><input placeholder="Search client..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><select value={status} onChange={(event) => setStatus(event.target.value as TransactionStatus | "All")}><option>All</option>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><span>→</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
      <div className="table-card">
        <table>
          <thead><tr><th></th><th>Status</th><th>Order #</th><th>Client</th><th>Vehicle</th><th>Filled (L)</th><th>Total Price</th><th>Profit</th><th>Created At</th><th>Actions</th></tr></thead>
          <tbody>{shownTransactions.map((tx) => <FragmentTx key={tx.id} tx={tx} expanded={expanded === tx.id} toggle={() => setExpanded(expanded === tx.id ? null : tx.id)} view={() => setViewing(tx)} edit={() => setEditing(tx)} remove={() => void removeTransaction(tx)} />)}</tbody>
        </table>
        <div className="load-more-row">
          <button
            className="button outline"
            disabled={remainingTransactions === 0}
            onClick={() => setVisibleTransactions((count) => count + 10)}
          >
            {remainingTransactions > 0
              ? <><ChevronDown size={16} /> Load More ({remainingTransactions} remaining)</>
              : <>All {filtered.length} records shown</>}
          </button>
        </div>
      </div>
      {editing && <TransactionForm tx={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={(tx) => void saveTx(tx)} />}
      {viewing && <TransactionDetailsModal tx={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); }} />}
      {importOpen && <ImportDialog state={state} update={update} onClose={() => setImportOpen(false)} onError={setOperationError} />}
      {historyOpen && <ImportHistoryDialog batches={state.importBatches} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}

function FragmentTx({ tx, expanded, toggle, view, edit, remove }: { tx: Transaction; expanded: boolean; toggle: () => void; view: () => void; edit: () => void; remove: () => void }) {
  const detail = (label: string, value: ReactNode) => (
    <div className="transaction-detail" key={label}>
      <span>{label}</span>
      <strong>{value ?? "-"}</strong>
    </div>
  );
  return (
    <>
      <tr><td><IconButton label="Expand" onClick={toggle}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</IconButton></td><td><StatusBadge status={tx.status} /></td><td className="mono">{tx.order}</td><td>{tx.clientName}</td><td>{tx.vehicle}</td><td>{number(tx.filledFuelL)} L</td><td className="strong">{money(tx.totalPrice)}</td><td>{money(tx.profit)}</td><td>{dateTime(tx.createdAt)}</td><td><div className="table-actions"><IconButton label="View" onClick={view}><Eye size={16} /></IconButton><IconButton label="Edit" onClick={edit}><Pencil size={16} /></IconButton><IconButton label="Delete" danger onClick={remove}><Trash2 size={16} /></IconButton></div></td></tr>
      {expanded && (
        <tr className="detail-row">
          <td colSpan={10}>
            <div className="transaction-detail-grid">
              {detail("Depot", tx.depot)}
              {detail("Driver", tx.driver ?? "-")}
              {detail("Vehicle ODO", number(tx.vehicleOdoReading, 0))}
              {detail("Requested Fuel (L)", `${number(tx.requestedFuelL)} L`)}
              {detail("Parking Nights", number(tx.parkingNights, 0))}
              {detail("Nights Actual", number(tx.nightsActual, 0))}
              {detail("Parking Fee", money(tx.parkingFee))}
              {detail("Parking Cost Price", money(tx.parkingCostPrice))}
              {detail("Cost Price (per L)", tx.costPricePerL == null ? "-" : `R ${number(tx.costPricePerL, 4)}`)}
              {detail("Fuel Price (per L)", tx.fuelPricePerL == null ? "-" : `R ${number(tx.fuelPricePerL, 4)}`)}
              {detail("Total Cost Price", money(tx.totalCostPrice))}
              {detail("Profit", money(tx.profit))}
              {detail("Created By", tx.createdBy ?? "-")}
              {detail("Completed At", dateTime(tx.completedAt))}
              {detail("Expires At", dateTime(tx.expiresAt))}
              {tx.notes && detail("Notes", tx.notes)}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function TransactionDetailsModal({ tx, onClose, onEdit }: { tx: Transaction; onClose: () => void; onEdit: () => void }) {
  const fields = [
    ["Client Name", tx.clientName],
    ["Depot", tx.depot],
    ["Vehicle", tx.vehicle],
    ["Driver", tx.driver ?? "-"],
    ["Vehicle ODO", number(tx.vehicleOdoReading, 0)],
    ["Status", tx.status],
    ["Requested Fuel (L)", `${number(tx.requestedFuelL)} L`],
    ["Filled Fuel (L)", `${number(tx.filledFuelL)} L`],
    ["Fuel Price / L", tx.fuelPricePerL == null ? "-" : `R ${number(tx.fuelPricePerL, 4)}`],
    ["Total Price", money(tx.totalPrice)],
    ["Cost Price / L", tx.costPricePerL == null ? "-" : `R ${number(tx.costPricePerL, 4)}`],
    ["Total Cost Price", money(tx.totalCostPrice)],
    ["Profit", money(tx.profit)],
    ["Parking Nights", number(tx.parkingNights, 0)],
    ["Nights Actual", number(tx.nightsActual, 0)],
    ["Parking Fee", money(tx.parkingFee)],
    ["Parking Cost Price", money(tx.parkingCostPrice)],
    ["Created By", tx.createdBy ?? "-"],
    ["Created At", dateTime(tx.createdAt)],
    ["Completed At", dateTime(tx.completedAt)],
    ["Expires At", dateTime(tx.expiresAt)],
  ];
  return (
    <Modal title="Transaction Details" onClose={onClose} wide>
      <div className="transaction-view-heading"><StatusBadge status={tx.status} /><span className="mono">{tx.order}</span></div>
      <div className="transaction-view-grid">
        {fields.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      {tx.notes && <div className="transaction-notes"><span>Notes</span><p>{tx.notes}</p></div>}
      <div className="modal-actions transaction-view-actions"><button className="button outline" onClick={onClose}>Close</button><button className="button primary" onClick={onEdit}><Pencil size={16} /> Edit Transaction</button></div>
    </Modal>
  );
}

function TransactionForm({ tx, onClose, onSave }: { tx?: Transaction; onClose: () => void; onSave: (tx: Transaction) => void }) {
  const [form, setForm] = useState<Transaction>(tx ?? { id: makeId("tx"), order: `ORD-${Date.now().toString().slice(-8)}`, clientName: "", depot: "", vehicle: "", status: "Pending", totalPrice: 0, createdAt: new Date().toISOString() });
  const set = (key: keyof Transaction, value: string | number | undefined) => setForm((current) => ({ ...current, [key]: value }));
  const dateInputValue = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  const setDate = (key: "createdAt" | "completedAt", value: string) => {
    set(key, value ? new Date(value).toISOString() : undefined);
  };
  return (
    <Modal title={tx ? "Edit Transaction" : "Add Transaction"} onClose={onClose}>
      <form className="form-grid" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <label>Order #<input value={form.order} onChange={(event) => set("order", event.target.value)} required /></label>
        <label>Client Name<input value={form.clientName} onChange={(event) => set("clientName", event.target.value)} required /></label>
        <label>Depot<input value={form.depot} onChange={(event) => set("depot", event.target.value)} /></label>
        <label>Vehicle<input value={form.vehicle} onChange={(event) => set("vehicle", event.target.value)} /></label>
        <label>ODO Reading<input type="number" value={form.vehicleOdoReading ?? ""} onChange={(event) => set("vehicleOdoReading", event.target.value ? Number(event.target.value) : undefined)} /></label>
        <label>Driver<input value={form.driver ?? ""} onChange={(event) => set("driver", event.target.value)} /></label>
        <label>Status<select value={form.status} onChange={(event) => set("status", event.target.value)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Filled Fuel (L)<input type="number" step="0.1" value={form.filledFuelL ?? ""} onChange={(event) => set("filledFuelL", event.target.value ? Number(event.target.value) : undefined)} /></label>
        <label>Fuel Price/L (R)<input type="number" step="0.01" value={form.fuelPricePerL ?? ""} onChange={(event) => set("fuelPricePerL", event.target.value ? Number(event.target.value) : undefined)} /></label>
        <label>Total Price (R)<input type="number" step="0.01" value={form.totalPrice} onChange={(event) => set("totalPrice", Number(event.target.value))} /></label>
        <label>Parking Fee (R)<input type="number" step="0.01" value={form.parkingFee ?? ""} onChange={(event) => set("parkingFee", event.target.value ? Number(event.target.value) : undefined)} /></label>
        <label>Completed At<input type="datetime-local" value={dateInputValue(form.completedAt)} onChange={(event) => setDate("completedAt", event.target.value)} /></label>
        <label>Created At<input type="datetime-local" value={dateInputValue(form.createdAt)} onChange={(event) => setDate("createdAt", event.target.value)} required /></label>
        <label className="full">Notes<textarea value={form.notes ?? ""} onChange={(event) => set("notes", event.target.value)} rows={3} /></label>
        <div className="modal-actions full"><button type="button" className="button outline" onClick={onClose}>Cancel</button><button className="button primary" type="submit">Save Transaction</button></div>
      </form>
    </Modal>
  );
}

function ImportDialog({ state, update, onClose, onError }: { state: AppState; update: (next: Partial<AppState>) => void; onClose: () => void; onError: (message: string) => void }) {
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<Transaction[]>([]);
  const [message, setMessage] = useState("");
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const rawRows = await parseWorkbookRows(file);
    setRows(mapImportRows(rawRows));
  };
  const commit = async () => {
    const orders = new Set(rows.map((tx) => tx.order));
    const preserved = state.transactions.filter((tx) => !orders.has(tx.order));
    const actorEmail = state.currentUser?.email ?? "unknown";
    const batch: ImportBatch = { id: makeId("batch"), filename, importedAt: new Date().toISOString(), importedBy: actorEmail, rowsInFile: rows.length, imported: rows.length, skipped: 0, droppedInParser: 0, orderNumbers: rows.map((tx) => tx.order) };
    onError("");
    try {
      const savedRows = await importTransactions(rows, batch);
      void writeActivityLog("Imported transactions", `${rows.length} rows imported from ${filename}`).catch(() => undefined);
      update({ transactions: [...savedRows, ...preserved], importBatches: [batch, ...state.importBatches], activityLogs: [{ id: makeId("activity"), action: "Imported transactions", adminEmail: actorEmail, details: `${rows.length} rows imported from ${filename}`, performedAt: new Date().toISOString() }, ...state.activityLogs] });
      setMessage(`Import complete - ${rows.length} records processed by Order #.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not import the transactions.");
    }
  };
  return (
    <Modal title="Import Transactions" onClose={onClose} wide>
      <div className="import-drop"><Upload size={28} /><strong>Choose the FuelSearch export</strong><p>Supports .xlsx, .xls, and .csv. Existing records are replaced by Order #.</p><input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} /></div>
      {rows.length > 0 && <div className="table-card compact"><div className="section-head"><div><h2>{filename}</h2><p>{rows.length} valid rows detected. Previewing first 5 rows.</p></div><button className="button primary" onClick={() => void commit()}>Import {rows.length} Rows</button></div><SimpleTxTable transactions={rows.slice(0, 5)} /></div>}
      {message && <p className="success-note"><CheckCircle2 size={16} /> {message}</p>}
    </Modal>
  );
}

function ImportHistoryDialog({ batches, onClose }: { batches: ImportBatch[]; onClose: () => void }) {
  return <Modal title="Import History" onClose={onClose} wide><div className="table-card compact"><table><thead><tr><th>File</th><th>Imported At</th><th>Imported By</th><th>Rows</th><th>Imported</th></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td>{batch.filename}</td><td>{dateTime(batch.importedAt)}</td><td>{batch.importedBy}</td><td>{batch.rowsInFile}</td><td>{batch.imported}</td></tr>)}</tbody></table></div></Modal>;
}

function CustomersAdmin({
  state,
  update,
  canPreviewUsers,
  previewAs,
}: {
  state: AppState;
  update: (next: Partial<AppState>) => void;
  canPreviewUsers: boolean;
  previewAs: (user: PortalUser) => void;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [userError, setUserError] = useState("");
  const [temporaryCredentials, setTemporaryCredentials] = useState<{ email: string; password: string } | null>(null);
  const currentAdmin = getSignedInAdmin(state);
  const allowSuperAdmin = isSuperAdminRole(currentAdmin?.role);
  const visibleCustomers = useMemo(
    () => {
      const customers = allowSuperAdmin ? state.customers : state.customers.filter((customer) => customer.role !== "super_admin");
      return [...customers].sort((left, right) => left.clientName.localeCompare(right.clientName));
    },
    [allowSuperAdmin, state.customers],
  );
  const filteredCustomers = useMemo(
    () => {
      const query = search.trim().toLowerCase();
      if (!query) return visibleCustomers;
      return visibleCustomers.filter((customer) => {
        const haystack = [
          customer.email,
          customer.clientName,
          customer.displayName,
          formatRole(customer.role),
          summarizePermissions(customer),
        ].join(" ").toLowerCase();
        return haystack.includes(query);
      });
    },
    [search, visibleCustomers],
  );
  const save = async (customer: Customer) => {
    setUserError("");
    const normalized: Customer = {
      ...customer,
      adminPermissions: customer.role === "admin" ? normalizeAdminPermissions(customer.adminPermissions) : undefined,
    };
    const existing = state.customers.find((item) => item.id === normalized.id);
    try {
      if (existing) {
        await updatePortalUser(normalized);
      } else {
        const result = await createPortalUser(normalized);
        if (!result?.user?.id || !result.temporaryPassword) {
          throw new Error("The user was created without temporary credentials.");
        }
        normalized.id = result.user.id;
        setTemporaryCredentials({
          email: normalized.email,
          password: result.temporaryPassword,
        });
      }
      void writeActivityLog(existing ? "Updated user" : "Created user", buildCustomerAuditDetails(normalized)).catch(() => undefined);
    } catch (saveError) {
      setUserError(saveError instanceof Error ? saveError.message : "Could not save the user.");
      return;
    }
    const now = new Date().toISOString();
    const actorEmail = currentAdmin?.email ?? state.currentUser?.email ?? "unknown";
    const customers = existing ? state.customers.map((item) => item.id === normalized.id ? normalized : item) : [normalized, ...state.customers];
    update({
      customers,
      activityLogs: [
        {
          id: makeId("activity"),
          action: existing ? "Updated user" : "Created user",
          adminEmail: actorEmail,
          details: buildCustomerAuditDetails(normalized),
          performedAt: now,
        },
        ...state.activityLogs,
      ],
    });
    setEditing(null);
  };
  const deactivate = async (customer: Customer) => {
    if (!window.confirm(`Deactivate ${customer.displayName}? They will no longer be able to sign in.`)) return;
    setUserError("");
    try {
      await deactivatePortalUser(customer.id);
      void writeActivityLog("Deactivated user", buildCustomerAuditDetails(customer)).catch(() => undefined);
      update({
        customers: state.customers.filter((item) => item.id !== customer.id),
        activityLogs: [{
          id: makeId("activity"),
          action: "Deactivated user",
          adminEmail: currentAdmin?.email ?? state.currentUser?.email ?? "unknown",
          details: buildCustomerAuditDetails(customer),
          performedAt: new Date().toISOString(),
        }, ...state.activityLogs],
      });
    } catch (deactivateError) {
      setUserError(deactivateError instanceof Error ? deactivateError.message : "Could not deactivate the user.");
    }
  };
  const resetUserPassword = async (customer: Customer) => {
    if (!window.confirm(`Issue a new temporary password for ${customer.displayName}?`)) return;
    setUserError("");
    try {
      const result = await resetPortalUserPassword(customer.id);
      if (!result?.temporaryPassword) throw new Error("No temporary password was returned.");
      void writeActivityLog("Reset user password", customer.email).catch(() => undefined);
      setTemporaryCredentials({ email: customer.email, password: result.temporaryPassword });
    } catch (resetError) {
      setUserError(resetError instanceof Error ? resetError.message : "Could not reset the user's password.");
    }
  };
  return (
    <div className="page-stack">
      <div className="page-title-row"><h1>Users</h1><div className="row-actions"><button className="button primary" onClick={() => setEditing("new")}><UserPlus size={16} /> Add User</button></div></div>
      <div className="info-box"><AlertCircle size={20} /><div><strong>Adding a portal user</strong><p>The portal creates a confirmed Auth account and one-time temporary password. Share it securely; the user must replace it on first sign-in.</p></div></div>
      {userError && <p className="auth-message auth-error" role="alert">{userError}</p>}
      <div className="filters"><label><Search size={16} /><input placeholder="Search by email, name, or role..." value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      <div className="table-card">
        <table>
          <thead><tr><th>Email</th><th>Client Name</th><th>Display Name</th><th>Role</th><th>Access</th><th>Actions</th></tr></thead>
          <tbody>
            {filteredCustomers.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.email}</td>
                <td>{customer.clientName}</td>
                <td>{customer.displayName}</td>
                <td><StatusBadge status={customer.role} /></td>
                <td><span className="access-summary">{summarizePermissions(customer)}</span></td>
                <td>
                  <div className="table-actions">
                    {canPreviewUsers && (
                      <IconButton
                        label={`Preview as ${customer.displayName}`}
                        onClick={() => {
                          previewAs({
                            id: customer.id,
                            email: customer.email,
                            displayName: customer.displayName,
                            role: customer.role,
                            clientName: customer.role === "customer" ? customer.clientName : undefined,
                          });
                          navigate(customer.role === "customer" ? "/statement" : "/admin");
                        }}
                      >
                        <Eye size={16} />
                      </IconButton>
                    )}
                    <IconButton label="Issue new temporary password" onClick={() => void resetUserPassword(customer)}><KeyRound size={16} /></IconButton>
                    <IconButton label="Edit" onClick={() => setEditing(customer)}><Pencil size={16} /></IconButton>
                    <IconButton label="Deactivate" danger onClick={() => void deactivate(customer)}><Trash2 size={16} /></IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredCustomers.length === 0 && <div className="empty-support"><Users size={24} /><strong>No matching users</strong><span>Try changing the search or filters.</span></div>}
      </div>
      {editing && <CustomerForm customer={editing === "new" ? undefined : editing} clientDirectory={state.clientDirectory} allowSuperAdmin={allowSuperAdmin} onClose={() => setEditing(null)} onSave={save} />}
      {temporaryCredentials && (
        <Modal title="Temporary credentials" onClose={() => setTemporaryCredentials(null)}>
          <div className="credential-card">
            <p>Share these temporary credentials securely. The password is shown only once.</p>
            <label>Email<input value={temporaryCredentials.email} readOnly /></label>
            <label>Temporary password<input value={temporaryCredentials.password} readOnly /></label>
            <div className="modal-actions">
              <button
                className="button outline"
                type="button"
                onClick={() => void navigator.clipboard.writeText(
                  `FuelSearch portal\nEmail: ${temporaryCredentials.email}\nTemporary password: ${temporaryCredentials.password}`,
                )}
              >
                Copy credentials
              </button>
              <button className="button primary" type="button" onClick={() => setTemporaryCredentials(null)}>Done</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CustomerForm({ customer, clientDirectory, allowSuperAdmin, onClose, onSave }: { customer?: Customer; clientDirectory: ClientDirectoryEntry[]; allowSuperAdmin: boolean; onClose: () => void; onSave: (customer: Customer) => void }) {
  const createDraft = () => {
    const draft: Customer = customer
      ? {
          ...customer,
          role: customer.role === "super_admin" && !allowSuperAdmin ? "admin" : customer.role,
          adminPermissions: customer.role === "admin" ? normalizeAdminPermissions(customer.adminPermissions) : undefined,
        }
      : { id: makeId("customer"), email: "", clientName: "", displayName: "", role: "customer" };
    if (draft.role === "admin") {
      draft.adminPermissions = normalizeAdminPermissions(draft.adminPermissions);
    } else {
      draft.adminPermissions = undefined;
    }
    return draft;
  };
  const [form, setForm] = useState<Customer>(() => createDraft());
  useEffect(() => {
    setForm(createDraft());
  }, [customer, allowSuperAdmin]);
  const set = (key: keyof Customer, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const setRole = (role: Role) => {
    setForm((current) => ({
      ...current,
      role,
      clientName: role === "customer" ? current.clientName : current.clientName || "FuelSearch",
      adminPermissions: role === "admin" ? normalizeAdminPermissions(current.adminPermissions) : undefined,
    }));
  };
  const setPermission = (key: AdminPermissionKey, checked: boolean) => {
    setForm((current) => ({
      ...current,
      adminPermissions: {
        ...normalizeAdminPermissions(current.adminPermissions),
        [key]: checked,
      },
    }));
  };
  const selectClient = (clientName: string) => {
    const client = clientDirectory.find((item) => item.clientName === clientName);
    setForm((current) => ({
      ...current,
      clientName,
      displayName: client?.contactPerson ?? current.displayName,
      address: client?.address ?? current.address,
    }));
  };
  return (
    <Modal title={customer ? "Edit User" : "Add User"} onClose={onClose}>
      <form className="customer-form" onSubmit={(event) => { event.preventDefault(); onSave(form.role === "admin" ? { ...form, adminPermissions: normalizeAdminPermissions(form.adminPermissions) } : { ...form, adminPermissions: undefined }); }}>
        <p className="form-intro">{customer ? "Update the details for this user account." : "Create a new portal user and add their invoice details."}</p>

        <label>Email *<input type="email" value={form.email} onChange={(event) => set("email", event.target.value)} required /></label>
        <label>Client Name {form.role === "customer" ? "*" : <span>(not required for admins)</span>}<input list="client-directory-options" value={form.clientName} onChange={(event) => selectClient(event.target.value)} placeholder={form.role === "customer" ? "Enter the company name..." : "FuelSearch"} required={form.role === "customer"} /><datalist id="client-directory-options">{clientDirectory.map((client) => <option key={client.id} value={client.clientName}>{client.contactPerson ?? client.email ?? ""}</option>)}</datalist></label>
        <label>Contact Person<input value={form.displayName} onChange={(event) => set("displayName", event.target.value)} /></label>

        <label>Role<select className="role-select" value={form.role} onChange={(event) => setRole(event.target.value as Role)}>
          <option value="customer">Customer</option>
          <option value="admin">Admin</option>
          {allowSuperAdmin && <option value="super_admin">Super Admin</option>}
        </select></label>
        <p className="role-help">
          {form.role === "super_admin"
            ? "Super admins have full access and are only available in super admin sessions."
            : form.role === "admin"
              ? "Admins can be granted only the permissions they need."
              : "Customers see their statements and invoices only."}
        </p>

        {form.role === "admin" && (
          <section className="permissions-panel">
            <div className="company-fields-title">
              <strong>Admin Permissions</strong>
              <span>Trim access to only the areas this admin needs.</span>
            </div>
            <div className="permissions-list">
              {ADMIN_PERMISSION_FIELDS.map(({ key, label, help }) => (
                <label key={key} className="permission-item">
                  <input type="checkbox" checked={Boolean(form.adminPermissions?.[key])} onChange={(event) => setPermission(key, event.target.checked)} />
                  <span>
                    <strong>{label}</strong>
                    <small>{help}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>
        )}

        {form.role === "super_admin" && (
          <div className="access-note">
            Super admins automatically receive every permission in the portal.
          </div>
        )}

        <section className="company-fields">
          <div className="company-fields-title"><strong>Company Details</strong><span>Shown dynamically on customer invoices</span></div>
          <label>Address<textarea value={form.address ?? ""} onChange={(event) => set("address", event.target.value)} rows={3} /></label>
          <div className="company-fields-grid">
            <label>VAT Number <span>(optional)</span><input placeholder="e.g. 4123456789" value={form.vatNumber ?? ""} onChange={(event) => set("vatNumber", event.target.value)} /></label>
            <label>Reg. Number <span>(optional)</span><input placeholder="e.g. 2005/012345/07" value={form.registration ?? ""} onChange={(event) => set("registration", event.target.value)} /></label>
          </div>
        </section>

        <div className="modal-actions"><button type="button" className="button outline" onClick={onClose}>Cancel</button><button className="button primary" type="submit">Save User</button></div>
      </form>
    </Modal>
  );
}

function IssuesAdmin({ state, update }: { state: AppState; update: (next: Partial<AppState>) => void }) {
  const location = useLocation();
  const currentAdmin = getSignedInAdmin(state);
  const [search, setSearch] = useState("");
  const [status, setStatusFilter] = useState<IssueStatus | "All">("All");
  const [category, setCategory] = useState("All");
  const [requestSource, setRequestSource] = useState<"All" | "Customer" | "Admin">("All");
  const [selected, setSelected] = useState<Issue | null>(null);
  const [creating, setCreating] = useState(false);
  const [operationError, setOperationError] = useState("");
  const categories = Array.from(new Set(state.issues.map((issue) => issue.category))).sort();
  const filtered = state.issues
    .filter((issue) => {
      const haystack = `${issue.title} ${issue.description} ${issue.reportedBy} ${issue.orderRef ?? ""}`.toLowerCase();
      const sourceType = issue.source === "Admin Portal" ? "Admin" : "Customer";
      return (!search || haystack.includes(search.toLowerCase())) && (status === "All" || issue.status === status) && (category === "All" || issue.category === category) && (requestSource === "All" || sourceType === requestSource);
    })
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  const saveIssue = async (issue: Issue) => {
    setOperationError("");
    try {
      await updateIssue(issue);
      void writeActivityLog("Updated support request", issue.title).catch(() => undefined);
      update({ issues: state.issues.map((item) => item.id === issue.id ? issue : item) });
      setSelected(null);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "Could not update the support request.");
    }
  };

  useEffect(() => {
    if (location.pathname === "/admin/issues" && state.issues.some((issue) => isAfter(issue.loggedAt, state.supportNotificationsSeenAt))) {
      update({ supportNotificationsSeenAt: new Date().toISOString() });
    }
  }, [location.pathname, state.issues, state.supportNotificationsSeenAt]);

  const createRequest = async (payload: { title: string; description: string; category: string; priority: IssuePriority; orderRef?: string }) => {
    const now = new Date().toISOString();
    const draft: Issue = {
        id: makeId("request"),
        ...payload,
        status: "Open",
        reportedBy: currentAdmin?.displayName ?? state.currentUser?.displayName ?? "Admin",
        source: "Admin Portal",
        loggedAt: now,
        updatedAt: now,
    };
    setOperationError("");
    try {
      const saved = await createIssue(draft);
      void writeActivityLog("Created support request", saved.title).catch(() => undefined);
      update({ issues: [saved, ...state.issues] });
      setCreating(false);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "Could not create the support request.");
    }
  };
  return (
    <div className="page-stack support-page">
      <div className="page-title-row">
        <div><h1>Support & Requests</h1><p>Manage reported problems, data corrections, feature ideas, and portal update requests.</p></div>
        <button className="button primary" onClick={() => setCreating(true)}><MessageSquarePlus size={16} /> New Request</button>
      </div>
      {operationError && <p className="auth-message auth-error" role="alert">{operationError}</p>}
      <div className="support-summary">
        <SummaryCard icon={<LifeBuoy />} label="Open" value={String(state.issues.filter((issue) => issue.status === "Open").length)} />
        <SummaryCard icon={<History />} label="In Progress" value={String(state.issues.filter((issue) => issue.status === "In Progress").length)} />
        <SummaryCard icon={<CheckCircle2 />} label="Resolved" value={String(state.issues.filter((issue) => issue.status === "Resolved").length)} />
      </div>
      <div className="support-filters">
        <div className="filter-field filter-search"><span>Search</span><label><Search size={16} /><input placeholder="Search title, details, reporter, or order..." value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
        <label className="filter-field"><span>Status</span><select value={status} onChange={(event) => setStatusFilter(event.target.value as IssueStatus | "All")}><option value="All">All statuses</option>{ISSUE_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="filter-field"><span>Request Type</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="All">All types</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="filter-field"><span>Request Source</span><select value={requestSource} onChange={(event) => setRequestSource(event.target.value as "All" | "Customer" | "Admin")}><option value="All">All sources</option><option value="Customer">Customer requests</option><option value="Admin">Admin requests</option></select></label>
      </div>
      <div className="table-card">
        <table>
          <thead><tr><th>Request</th><th>Type</th><th>Priority</th><th>Status</th><th>Reported By</th><th>Order</th><th>Updated</th><th>Action</th></tr></thead>
          <tbody>
            {filtered.map((issue) => (
              <tr key={issue.id}>
                <td><strong>{issue.title}</strong><br /><span className="support-description">{issue.description}</span></td>
                <td><span className="request-type">{issue.category}</span></td>
                <td><span className={`priority priority-${issue.priority.toLowerCase()}`}>{issue.priority}</span></td>
                <td><StatusBadge status={issue.status} /></td>
                <td>{issue.reportedBy}<br /><span>{issue.source}</span></td>
                <td className="mono">{issue.orderRef ?? "-"}</td>
                <td>{dateTime(issue.updatedAt)}</td>
                <td><IconButton label="Review request" onClick={() => setSelected(issue)}><Eye size={16} /></IconButton></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-support"><LifeBuoy size={24} /><strong>No matching requests</strong><span>Try changing the search or filters.</span></div>}
      </div>
      {creating && <IssueDialog onClose={() => setCreating(false)} onSubmit={(payload) => void createRequest(payload)} />}
      {selected && <SupportRequestModal issue={selected} onClose={() => setSelected(null)} onSave={(issue) => void saveIssue(issue)} />}
    </div>
  );
}

function SupportRequestModal({ issue, onClose, onSave }: { issue: Issue; onClose: () => void; onSave: (issue: Issue) => void }) {
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [priority, setPriority] = useState<IssuePriority>(issue.priority);
  const [resolutionNotes, setResolutionNotes] = useState(issue.resolutionNotes ?? "");
  const save = () => onSave({ ...issue, status, priority, resolutionNotes, updatedAt: new Date().toISOString() });
  return (
    <Modal title="Review Support Request" onClose={onClose} wide>
      <div className="support-request-head">
        <div><span className="request-type">{issue.category}</span><h2>{issue.title}</h2><p>Submitted by {issue.reportedBy} via {issue.source} on {dateTime(issue.loggedAt)}</p></div>
        <StatusBadge status={issue.status} />
      </div>
      <div className="support-request-body">
        <section>
          <h3>Request details</h3>
          <p>{issue.description}</p>
          {issue.orderRef && <div className="linked-order"><span>Linked order</span><strong className="mono">{issue.orderRef}</strong></div>}
        </section>
        <aside>
          <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as IssueStatus)}>{ISSUE_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as IssuePriority)}>{ISSUE_PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
        </aside>
      </div>
      <div className="support-response">
        <label>Admin Response / Resolution Notes<textarea rows={5} value={resolutionNotes} onChange={(event) => setResolutionNotes(event.target.value)} placeholder="Add an update, answer, workaround, or resolution for the customer..." /></label>
        <p>This response will be available to the customer when the backend and customer request history are connected.</p>
      </div>
      <div className="modal-actions transaction-view-actions"><button className="button outline" onClick={onClose}>Cancel</button><button className="button primary" onClick={save}>Save Update</button></div>
    </Modal>
  );
}

function HelpGuide() {
  const sections = ["System Overview", "Getting Started", "Admin Dashboard", "Adding New Users", "Portal Login", "Transactions & Export", "CSV Import Guide", "Import History", "Customer Statement", "Invoices & PDF Export"];
  return (
    <div className="page-stack help-page">
      <h1>Help & User Guide</h1><p>Everything you need to know about using the FuelSearch Portal</p>
      <div className="help-layout"><aside>{sections.map((item, index) => <a href={`#${index}`} key={item} className={index === 0 ? "active" : ""}>{item}</a>)}</aside><article><h2>System Overview</h2><p>The FuelSearch Portal replaces customer-facing Google Sheets with a proper web app. It consists of the Admin Portal for staff and the Customer Statement for fleet operators.</p><div className="guide-grid"><div><Shield size={18} /><h3>Admin Portal</h3><ul><li>Dashboard with user count and recent transactions</li><li>Add and manage customer accounts</li><li>Import transactions via CSV or XLSX</li><li>View import history and activity logs</li><li>Manage customer support and feature requests</li></ul></div><div><Eye size={18} /><h3>Customer Portal</h3><ul><li>View their own statement only</li><li>Filter by month and status</li><li>Sort transactions newest or oldest first</li><li>Open per-transaction invoices</li><li>Report problems and request features or updates</li></ul></div></div><div className="info-box blue"><AlertCircle size={18} /><p><strong>Daily workflow:</strong> Export transactions from the FuelSearch app, then import the CSV or XLSX under Admin {">"} Transactions {">"} Import. The system upserts records by Order #, so re-importing is safe and will not duplicate data.</p></div></article></div>
    </div>
  );
}

function ActivityLogPage({ state }: { state: AppState }) {
  return <div className="page-stack"><h1>Activity Log</h1><div className="table-card"><table><thead><tr><th>Action</th><th>Admin</th><th>Details</th><th>Performed At</th></tr></thead><tbody>{state.activityLogs.map((log) => <tr key={log.id}><td>{log.action}</td><td>{log.adminEmail}</td><td>{log.details}</td><td>{dateTime(log.performedAt)}</td></tr>)}</tbody></table></div></div>;
}

function downloadCsv(rows: Transaction[]) {
  const headers = ["Order #", "Client", "Depot", "Vehicle", "Status", "Filled Fuel (L)", "Fuel Price (per L)", "Total Price", "Created At"];
  const body = rows.map((tx) => [tx.order, tx.clientName, tx.depot, tx.vehicle, tx.status, tx.filledFuelL ?? "", tx.fuelPricePerL ?? "", tx.totalPrice, tx.createdAt].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([[headers.join(","), ...body].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "fuelsearch-statement.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default App;
