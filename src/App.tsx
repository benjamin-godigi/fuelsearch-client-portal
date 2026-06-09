import { ChangeEvent, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  EyeOff,
  FileText,
  Gauge,
  HelpCircle,
  History,
  KeyRound,
  LifeBuoy,
  LayoutDashboard,
  LogOut,
  MessageSquarePlus,
  MoreVertical,
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
  resetTransactions,
  saveTransaction,
  updateIssue,
  writeActivityLog,
  markIssueSeen,
} from "./services/portalOperations";

const LOGO_URL = "/fuelsearch-logo.svg";
const PREVIEW_USER_KEY = "fuelsearch-preview-user-id";
const TRANSACTION_PAGE_SIZE = 100;
const BANKING_DETAILS = [
  { bank: "FNB", account: "63026817544", name: "FUELSEARCH", branch: "250655" },
  { bank: "NEDBANK", account: "1238798306", name: "FUELSEARCH", branch: "198765" },
  { bank: "ABSA", account: "4105937663", name: "FUELSEARCH", branch: "632005" },
  { bank: "STANDARD BANK", account: "10184309490", name: "FUELSEARCH", branch: "001509" },
] as const;
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

function ActionMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);
  return (
    <div className="action-menu" ref={ref}>
      <button
        type="button"
        className="button outline action-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="action-menu-pop" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
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
  const [previewUserId, setPreviewUserId] = useState(() => sessionStorage.getItem(PREVIEW_USER_KEY) ?? "");
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  const update = (next: Partial<AppState>) => setState((current) => ({ ...current, ...next }));
  const hydrateSupabaseUser = useCallback(async (user: User) => {
    try {
      const portalData = await loadPortalData(user);
      const previewUser = previewUserId
        ? portalData.customers.find((customer) => customer.id === previewUserId)
        : undefined;
      const previewPortalUser: PortalUser | undefined = previewUser ? {
        id: previewUser.id,
        email: previewUser.email,
        displayName: previewUser.displayName,
        role: previewUser.role,
        clientName: previewUser.role === "customer" ? previewUser.clientName : undefined,
      } : undefined;
      if (previewUserId && !previewPortalUser) {
        sessionStorage.removeItem(PREVIEW_USER_KEY);
        setPreviewUserId("");
      }
      setState((current) => ({
        ...current,
        ...portalData,
        currentUser: previewPortalUser ?? portalData.currentUser,
      }));
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
  }, [previewUserId]);

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
    setPreviewUserId("");
    sessionStorage.removeItem(PREVIEW_USER_KEY);
  };

  const previewAs = (user: PortalUser) => {
    setPreviewUserId(user.id);
    sessionStorage.setItem(PREVIEW_USER_KEY, user.id);
    update({ currentUser: user });
  };
  const exitPreview = () => {
    setPreviewUserId("");
    sessionStorage.removeItem(PREVIEW_USER_KEY);
    if (signedInUser) update({ currentUser: signedInUser });
  };
  const isPreviewing = Boolean(previewUserId && signedInUser && state.currentUser && signedInUser.id !== state.currentUser.id);

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
  const [showPassword, setShowPassword] = useState(false);

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
          <div className="password-field"><input id="portal-password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
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
  const [showPassword, setShowPassword] = useState(false);

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
          <div className="password-field"><input id="required-new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          <label htmlFor="required-confirm-password">Confirm new password</label>
          <input
            id="required-confirm-password"
            type={showPassword ? "text" : "password"}
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
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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
  const customerIssues = state.issues.filter((issue) => issue.source === "Customer Statement");
  const unreadIssueUpdates = customerIssues.filter((issue) =>
    issue.customerUpdateAt && (!issue.customerSeenAt || issue.customerUpdateAt > issue.customerSeenAt),
  );
  const currentMonth = selectedMonth === monthKey(new Date().toISOString());
  const periodLabel = currentMonth ? `${monthLabel(selectedMonth)} Month-to-Date` : monthLabel(selectedMonth);

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
      {exitPreview && <div className="preview-banner"><Shield size={16} /><span>Previewing the customer portal as <strong>{state.currentUser?.displayName}</strong></span><button className="button ghost" onClick={exitPreview}>Return to Admin Portal</button></div>}
      <header className="statement-top">
        <div>
          <img src={LOGO_URL} alt="FuelSearch" className="brand-logo" />
          <small>Reg No: 2022/776599/07</small>
        </div>
        <div className="top-actions">
          <strong>Hi, {state.currentUser?.displayName}</strong>
          <button className="button ghost" onClick={() => setHelpOpen(true)}><HelpCircle size={16} /> Help</button>
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
          <button className="button outline notification-button" onClick={() => setRequestsOpen(true)}>
            <MessageSquarePlus size={16} /> My Requests
            {unreadIssueUpdates.length > 0 && <span className="notification-badge">{unreadIssueUpdates.length}</span>}
          </button>
          <button className="button outline" onClick={() => setIssueTx({ ...monthTx[0], order: "" })}>
            <LifeBuoy size={16} /> Support & Requests
          </button>
        </div>
        <div className="summary-grid">
          <SummaryCard icon={<Gauge />} label={`Litres - ${periodLabel}`} value={`${number(totalLitres)} L`} />
          <SummaryCard icon={<FileText />} label={`Total - ${periodLabel}`} value={money(totalAmount)} />
          <SummaryCard icon={<ClipboardList />} label={`Orders - ${periodLabel}`} value={String(completed.length)} />
        </div>
        <div className="toolbar">
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
            {months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
          </select>
          <button className="button outline" onClick={() => setSort((value) => (value === "newest" ? "oldest" : "newest"))}>
            <ArrowDownUp size={16} /> {sort === "newest" ? "Newest first" : "Oldest first"}
          </button>
          <button className="button outline push-right" onClick={() => downloadStatementCsv(monthTx, clientName, selectedMonth, currentMonth)}>
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
      {requestsOpen && <CustomerRequestsDialog issues={customerIssues} onClose={() => setRequestsOpen(false)} onSeen={async (issue) => { await markIssueSeen(issue.id); update({ issues: state.issues.map((item) => item.id === issue.id ? { ...item, customerSeenAt: new Date().toISOString() } : item) }); }} />}
      {helpOpen && <Modal title="Help & User Guide" onClose={() => setHelpOpen(false)} wide><HelpGuide role="customer" embedded /></Modal>}
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
        <button className="button outline" onClick={() => window.print()}><FileText size={16} /> Print</button>
        <button className="button primary" onClick={() => void downloadInvoicePdf(tx, customer)}><Download size={16} /> Download PDF</button>
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
          {BANKING_DETAILS.map((bank) => <div key={bank.bank}><strong>{bank.bank}</strong><span>Account: {bank.account}</span><span>Name: {bank.name}</span><span>Branch: {bank.branch}</span></div>)}
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

function CustomerRequestsDialog({ issues, onClose, onSeen }: { issues: Issue[]; onClose: () => void; onSeen: (issue: Issue) => Promise<void> }) {
  const sorted = [...issues].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  return (
    <Modal title="My Support Requests" onClose={onClose} wide>
      <div className="customer-requests">
        {sorted.map((issue) => {
          const unread = Boolean(issue.customerUpdateAt && (!issue.customerSeenAt || issue.customerUpdateAt > issue.customerSeenAt));
          return (
            <article className={`customer-request ${unread ? "unread" : ""}`} key={issue.id}>
              <div className="customer-request-head"><div><h3>{issue.title}</h3><p>Submitted {dateTime(issue.loggedAt)}{issue.orderRef ? ` · Order ${issue.orderRef}` : ""}</p></div><StatusBadge status={issue.status} /></div>
              <p>{issue.description}</p>
              {issue.resolutionNotes && <div className="request-response"><strong>FuelSearch update</strong><p>{issue.resolutionNotes}</p></div>}
              <footer><span>Priority: {issue.priority} · Updated {dateTime(issue.updatedAt)}</span>{unread && <button className="mini-button" onClick={() => void onSeen(issue)}>Mark as read</button>}</footer>
            </article>
          );
        })}
        {sorted.length === 0 && <div className="empty-support"><LifeBuoy size={24} /><strong>No requests yet</strong><span>Your reported problems and their progress will appear here.</span></div>}
      </div>
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
          <NavLink to="/admin/help"><HelpCircle size={18} /> Help</NavLink>
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
          <Route path="help" element={<HelpGuide role="admin" />} />
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
            <button className="button outline" onClick={() => setVisibleTransactions((count) => count + 20)}>
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
  const [visibleTransactions, setVisibleTransactions] = useState(TRANSACTION_PAGE_SIZE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const [viewing, setViewing] = useState<Transaction | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [operationError, setOperationError] = useState("");
  const [operationSuccess, setOperationSuccess] = useState("");
  const filtered = state.transactions
    .filter((tx) => {
      const created = tx.createdAt.slice(0, 10);
      return (!search || tx.clientName.toLowerCase().includes(search.toLowerCase())) && (status === "All" || tx.status === status) && (!from || created >= from) && (!to || created <= to);
    })
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const shownTransactions = filtered.slice(0, visibleTransactions);
  const remainingTransactions = Math.max(0, filtered.length - visibleTransactions);

  useEffect(() => {
    setVisibleTransactions(TRANSACTION_PAGE_SIZE);
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
  const resetAllTransactions = async () => {
    setOperationError("");
    try {
      await resetTransactions();
      update({ transactions: [] });
      void writeActivityLog("Reset transactions", "Deleted all transaction records").catch(() => undefined);
      setResetOpen(false);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : "Could not reset transactions.");
    }
  };
  return (
    <div className="page-stack">
      <div className="page-title-row"><h1>Transactions</h1><div className="row-actions"><button className="button outline" onClick={() => setImportOpen(true)}><Upload size={16} /> Import</button><button className="button outline" onClick={() => setHistoryOpen(true)}><History size={16} /> Import History</button><button className="button primary" onClick={() => setEditing("new")}><Plus size={16} /> Add Manually</button><ActionMenu label="More actions"><button className="menu-item" onClick={() => downloadCsv(state.transactions, "fuelsearch-transactions.csv")}><Download size={16} /> Export CSV</button><button className="menu-item danger" onClick={() => setResetOpen(true)}><Trash2 size={16} /> Reset Transactions</button></ActionMenu></div></div>
      {operationError && <p className="auth-message auth-error" role="alert">{operationError}</p>}
      {operationSuccess && <p className="auth-message auth-success" role="status">{operationSuccess}</p>}
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
            onClick={() => setVisibleTransactions((count) => count + TRANSACTION_PAGE_SIZE)}
          >
            {remainingTransactions > 0
              ? <><ChevronDown size={16} /> Load More ({remainingTransactions} remaining)</>
              : <>All {filtered.length} records shown</>}
          </button>
        </div>
      </div>
      {editing && <TransactionForm tx={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSave={(tx) => void saveTx(tx)} />}
      {viewing && <TransactionDetailsModal tx={viewing} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null); }} />}
      {importOpen && <ImportDialog state={state} update={update} onClose={() => setImportOpen(false)} onError={setOperationError} onComplete={(message) => { setImportOpen(false); setOperationSuccess(message); }} />}
      {historyOpen && <ImportHistoryDialog batches={state.importBatches} onClose={() => setHistoryOpen(false)} />}
      {resetOpen && <ResetTransactionsDialog count={state.transactions.length} onClose={() => setResetOpen(false)} onReset={resetAllTransactions} />}
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

function ImportDialog({ state, update, onClose, onError, onComplete }: { state: AppState; update: (next: Partial<AppState>) => void; onClose: () => void; onError: (message: string) => void; onComplete: (message: string) => void }) {
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<Transaction[]>([]);
  const [message, setMessage] = useState("");
  const [importing, setImporting] = useState(false);
  const [processed, setProcessed] = useState(0);
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const rawRows = await parseWorkbookRows(file);
    setRows(mapImportRows(rawRows));
  };
  const commit = async () => {
    if (importing) return;
    const orders = new Set(rows.map((tx) => tx.order));
    const preserved = state.transactions.filter((tx) => !orders.has(tx.order));
    const actorEmail = state.currentUser?.email ?? "unknown";
    const batch: ImportBatch = { id: makeId("batch"), filename, importedAt: new Date().toISOString(), importedBy: actorEmail, rowsInFile: rows.length, imported: rows.length, skipped: 0, droppedInParser: 0, orderNumbers: rows.map((tx) => tx.order) };
    onError("");
    setMessage("");
    setProcessed(0);
    setImporting(true);
    try {
      const savedRows = await importTransactions(rows, batch, (completed) => setProcessed(completed));
      void writeActivityLog("Imported transactions", `${rows.length} rows imported from ${filename}`).catch(() => undefined);
      update({ transactions: [...savedRows, ...preserved], importBatches: [batch, ...state.importBatches], activityLogs: [{ id: makeId("activity"), action: "Imported transactions", adminEmail: actorEmail, details: `${rows.length} rows imported from ${filename}`, performedAt: new Date().toISOString() }, ...state.activityLogs] });
      onComplete(`Import complete: ${rows.length.toLocaleString()} rows processed from ${filename}.`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not import the transactions.");
    } finally {
      setImporting(false);
    }
  };
  const progress = rows.length > 0 ? Math.round((processed / rows.length) * 100) : 0;
  return (
    <Modal title="Import Transactions" onClose={onClose} wide>
      <div className="import-drop"><Upload size={28} /><strong>Choose the FuelSearch export</strong><p>Supports .xlsx, .xls, and .csv. Existing records are replaced by Order #.</p><input type="file" accept=".xlsx,.xls,.csv" disabled={importing} onChange={handleFile} /></div>
      {rows.length > 0 && <div className="table-card compact"><div className="section-head"><div><h2>{filename}</h2><p>{rows.length.toLocaleString()} valid rows detected. Previewing first 5 rows.</p></div><button className="button primary" disabled={importing} onClick={() => void commit()}>{importing ? `Importing ${progress}%` : `Import ${rows.length.toLocaleString()} Rows`}</button></div>{importing && <div className="import-progress" role="status" aria-live="polite"><div className="import-progress-copy"><strong>Import in progress</strong><span>{processed.toLocaleString()} of {rows.length.toLocaleString()} rows ({progress}%)</span></div><div className="import-progress-track"><span style={{ width: `${progress}%` }} /></div><p>Keep this window open until the import is complete.</p></div>}<SimpleTxTable transactions={rows.slice(0, 5)} /></div>}
      {message && <p className="success-note"><CheckCircle2 size={16} /> {message}</p>}
    </Modal>
  );
}

function ResetTransactionsDialog({ count, onClose, onReset }: { count: number; onClose: () => void; onReset: () => Promise<void> }) {
  const [confirmation, setConfirmation] = useState("");
  const [resetting, setResetting] = useState(false);
  const confirmReset = async () => {
    setResetting(true);
    try {
      await onReset();
    } finally {
      setResetting(false);
    }
  };
  return (
    <Modal title="Reset Transaction Records" onClose={onClose}>
      <div className="danger-confirmation">
        <AlertCircle size={24} />
        <h2>Delete all {count.toLocaleString()} transactions?</h2>
        <p>This cannot be undone. Export a backup first if these records may be needed.</p>
        <label>Type <strong>DELETE</strong> to confirm<input value={confirmation} disabled={resetting} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
        <div className="modal-actions"><button className="button outline" disabled={resetting} onClick={onClose}>Cancel</button><button className="button primary" disabled={confirmation !== "DELETE" || resetting} onClick={() => void confirmReset()}>{resetting ? "Deleting..." : "Delete All Transactions"}</button></div>
      </div>
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
  const [credentialsCopied, setCredentialsCopied] = useState(false);
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
        setCredentialsCopied(false);
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
                onClick={() => void navigator.clipboard.writeText(`FuelSearch portal\nEmail: ${temporaryCredentials.email}\nTemporary password: ${temporaryCredentials.password}`).then(() => setCredentialsCopied(true))}
              >
                {credentialsCopied ? <><CheckCircle2 size={16} /> Credentials copied</> : "Copy credentials"}
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
      clientId: client?.id,
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

function HelpGuide({ role, embedded = false }: { role: "admin" | "customer"; embedded?: boolean }) {
  const [search, setSearch] = useState("");
  const topics = [
    { roles: ["admin", "customer"], title: "Signing in and passwords", body: "Sign in with your approved email and password. Temporary passwords must be replaced once with a permanent password of at least 12 characters. Use the eye icon to check what you typed." },
    { roles: ["admin"], title: "Previewing a customer portal", body: "Super admins can choose a user from Preview portal as. A preview banner remains visible while testing. Select Return to Admin Portal when finished; preview mode survives normal session refreshes in the same browser tab." },
    { roles: ["admin"], title: "Adding users and linking companies", body: "Open Users, select Add User, choose an existing client company, and enter a unique email. Multiple users may share one company statement. Copy the one-time credentials and send them securely." },
    { roles: ["admin"], title: "Importing transactions", body: "Open Transactions > Import and select the FuelSearch XLSX, XLS, or CSV export. Imports run in batches with progress. Keep the window open until completion. Re-importing is safe because Order # updates existing records rather than duplicating them." },
    { roles: ["admin"], title: "Older records and import history", body: "Older files may be imported later without removing newer transactions. Use Import History to confirm filenames and row counts. Export transactions before using Reset; Reset requires typing DELETE." },
    { roles: ["admin"], title: "Managing transactions", body: "Search by client, filter status and dates, add or edit individual transactions, export all current transaction data, and load another 100 rows at a time." },
    { roles: ["admin"], title: "Support and customer updates", body: "Open Support & Requests, review the request, change its status, and add resolution notes. Customers see the new status and response under My Requests and receive an unread alert." },
    { roles: ["customer"], title: "Viewing your monthly statement", body: "Choose a month and status tab, then sort newest or oldest. Summary cards use completed transactions. Load More reveals additional statement rows." },
    { roles: ["customer"], title: "Downloading statements", body: "Download CSV Statement exports every transaction for the selected month, including rows not currently visible. The current month is labelled Month-to-Date and includes an as-at date." },
    { roles: ["customer"], title: "Invoices and PDFs", body: "Select View beside a transaction to open its invoice. Download PDF creates a branded FuelSearch invoice with transaction details, totals, and all banking details. Print remains available separately." },
    { roles: ["customer"], title: "Reporting and tracking problems", body: "Use Support & Requests to report a transaction or general issue. Open My Requests to see Open, In Progress, or Resolved status, FuelSearch responses, and unread updates." },
    { roles: ["admin", "customer"], title: "Troubleshooting", body: "Refresh the page after a deployment. If login fails, verify the email and password and contact a FuelSearch administrator for a temporary-password reset. If an import stops, read the displayed row number and retry the same file safely." },
  ].filter((topic) => topic.roles.includes(role));
  const query = search.trim().toLowerCase();
  const filteredTopics = topics.filter((topic) => !query || `${topic.title} ${topic.body}`.toLowerCase().includes(query));
  return (
    <div className={`page-stack help-page ${embedded ? "help-embedded" : ""}`}>
      {!embedded && <div><h1>Help & User Guide</h1><p>Practical instructions for using the FuelSearch Portal confidently.</p></div>}
      <label className="help-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search help, for example: import, password, invoice..." /></label>
      <div className="help-topic-grid">
        {filteredTopics.map((topic) => <article key={topic.title} className="help-topic"><HelpCircle size={20} /><div><h2>{topic.title}</h2><p>{topic.body}</p></div></article>)}
      </div>
      {filteredTopics.length === 0 && <div className="empty-support"><Search size={24} /><strong>No matching help topics</strong><span>Try a shorter search such as “import” or “password”.</span></div>}
    </div>
  );
}

function ActivityLogPage({ state }: { state: AppState }) {
  return <div className="page-stack"><h1>Activity Log</h1><div className="table-card"><table><thead><tr><th>Action</th><th>Admin</th><th>Details</th><th>Performed At</th></tr></thead><tbody>{state.activityLogs.map((log) => <tr key={log.id}><td>{log.action}</td><td>{log.adminEmail}</td><td>{log.details}</td><td>{dateTime(log.performedAt)}</td></tr>)}</tbody></table></div></div>;
}

function downloadCsv(rows: Transaction[], filename = "fuelsearch-statement.csv", preamble: string[] = []) {
  const headers = ["Order #", "Client", "Depot", "Vehicle", "Status", "Filled Fuel (L)", "Fuel Price (per L)", "Total Price", "Created At"];
  const body = rows.map((tx) => [tx.order, tx.clientName, tx.depot, tx.vehicle, tx.status, tx.filledFuelL ?? "", tx.fuelPricePerL ?? "", tx.totalPrice, tx.createdAt].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([[...preamble, headers.join(","), ...body].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

function downloadStatementCsv(rows: Transaction[], clientName: string, selectedMonth: string, monthToDate: boolean) {
  const [year, month] = selectedMonth.split("-");
  const period = monthToDate ? `${year}-${month}-month-to-date-as-at-${new Date().toISOString().slice(0, 10)}` : `${year}-${month}`;
  const asAt = new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" });
  downloadCsv(
    rows,
    `FuelSearch_${safeFilename(clientName)}_Statement_${period}.csv`,
    [
      `"FuelSearch Statement","${clientName.replace(/"/g, '""')}"`,
      `"Period","${monthToDate ? `${monthLabel(selectedMonth)} Month-to-Date` : monthLabel(selectedMonth)}"`,
      `"As at","${asAt}"`,
      "",
    ],
  );
}

async function downloadInvoicePdf(tx: Transaction, customer?: Customer) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const navy = [31, 68, 103] as const;
  const invoiceNumber = `INV-${tx.order}`;
  const fuelAmount = (tx.filledFuelL ?? 0) * (tx.fuelPricePerL ?? 0);
  const logoData = await loadImageDataUrl(LOGO_URL).catch(() => null);
  if (logoData) pdf.addImage(logoData, "PNG", 20, 11, 62, 12);
  pdf.setTextColor(...navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text("INVOICE", 195, 18, { align: "right" });
  pdf.setFontSize(8);
  pdf.text(`#${invoiceNumber}`, 195, 24, { align: "right" });
  pdf.setFontSize(10);
  if (!logoData) pdf.text("FUELSEARCH (PTY) LTD", 20, 18);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(90);
  pdf.setFontSize(7);
  pdf.text(["Clearwater Office Park, 1 Atlas Rd, Parkhaven, Boksburg, 1459", "info@fuelsearch.co.za  ·  +27 74 1199 787", "Reg No: 2022/776599/07"], 20, 24);
  pdf.setDrawColor(...navy);
  pdf.setLineWidth(0.8);
  pdf.line(20, 43, 195, 43);
  pdf.setTextColor(...navy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("BILL TO", 20, 55);
  pdf.text("INVOICE DETAILS", 145, 55);
  pdf.setFontSize(10);
  pdf.text(tx.clientName, 20, 63);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(90);
  pdf.setFontSize(8);
  pdf.text(customer?.address ?? "Address not supplied", 20, 69, { maxWidth: 75 });
  const details = [
    ["Date", shortDate(tx.createdAt)],
    ["Order Ref", tx.order],
    ["Vehicle", tx.vehicle],
    ["Depot", tx.depot],
    ["Driver", tx.driver ?? "-"],
  ];
  details.forEach(([label, value], index) => {
    const y = 62 + index * 7;
    pdf.text(label, 145, y);
    pdf.setTextColor(...navy);
    pdf.text(value, 195, y, { align: "right", maxWidth: 38 });
    pdf.setTextColor(90);
  });
  pdf.setFillColor(...navy);
  pdf.rect(20, 93, 175, 10, "F");
  pdf.setTextColor(255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("DESCRIPTION", 30, 99);
  pdf.text("QUANTITY", 122, 99);
  pdf.text("UNIT PRICE", 158, 99);
  pdf.text("AMOUNT", 192, 99, { align: "right" });
  pdf.setTextColor(40);
  pdf.setFontSize(9);
  pdf.text("Usage", 30, 116);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(100);
  pdf.text(`${tx.vehicle} · ${tx.depot}`, 30, 121, { maxWidth: 75 });
  pdf.setTextColor(40);
  pdf.text(`${number(tx.filledFuelL)} L`, 122, 116);
  pdf.text(`R ${number(tx.fuelPricePerL, 2)}/L`, 158, 116);
  pdf.setFont("helvetica", "bold");
  pdf.text(money(fuelAmount), 192, 116, { align: "right" });
  pdf.setDrawColor(220);
  pdf.line(20, 128, 195, 128);
  pdf.setFont("helvetica", "normal");
  pdf.text("Subtotal", 142, 138);
  pdf.text(money(tx.totalPrice), 192, 138, { align: "right" });
  pdf.text("VAT (0%)", 142, 146);
  pdf.text("R 0.00", 192, 146, { align: "right" });
  pdf.setFillColor(...navy);
  pdf.rect(136, 152, 59, 13, "F");
  pdf.setTextColor(255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("TOTAL DUE", 140, 160);
  pdf.text(money(tx.totalPrice), 192, 160, { align: "right" });
  pdf.setTextColor(...navy);
  pdf.setFontSize(7);
  pdf.text("BANKING DETAILS", 20, 179);
  pdf.line(20, 183, 195, 183);
  pdf.setFontSize(8);
  BANKING_DETAILS.forEach((bank, index) => {
    const x = index % 2 === 0 ? 24 : 112;
    const y = index < 2 ? 193 : 213;
    pdf.text(bank.bank, x, y);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(90);
    pdf.text(`Account: ${bank.account}`, x, y + 5);
    pdf.text(`Name: ${bank.name}`, x, y + 10);
    pdf.text(`Branch: ${bank.branch}`, x, y + 15);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...navy);
  });
  pdf.setFontSize(9);
  pdf.text("THANK YOU FOR YOUR BUSINESS", 107, 260, { align: "center" });
  pdf.setLineWidth(0.5);
  pdf.line(20, 270, 195, 270);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100);
  pdf.setFontSize(6);
  pdf.text("FuelSearch (Pty) Ltd · Reg No. 2022/776599/07", 20, 276);
  pdf.text("info@fuelsearch.co.za · +27 74 1199 787", 195, 276, { align: "right" });
  pdf.save(`FuelSearch_Invoice_${invoiceNumber}.pdf`);
}

async function loadImageDataUrl(source: string) {
  const response = await fetch(source);
  if (!response.ok) throw new Error("Could not load invoice logo.");
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare invoice logo.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

export default App;
