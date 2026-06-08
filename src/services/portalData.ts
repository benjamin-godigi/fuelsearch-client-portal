import type { User } from "@supabase/supabase-js";
import type {
  ActivityLog,
  AdminPermissions,
  ClientDirectoryEntry,
  Customer,
  ImportBatch,
  Issue,
  IssuePriority,
  IssueStatus,
  PortalUser,
  Transaction,
  TransactionStatus,
} from "../types";
import { requireSupabase } from "../lib/supabase";
import type { AppState } from "./store";

interface ClientRow {
  id: number;
  user_id: string | null;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  vat_number: string | null;
  registration_number: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  is_active: boolean;
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  email: string;
  display_name: string;
  role: "super_admin" | "admin" | "customer";
  admin_permissions: AdminPermissions | null;
  must_change_password: boolean;
  is_active: boolean;
  client_id: number | null;
}

interface TransactionRow {
  id: number;
  order_number: string;
  status: TransactionStatus;
  vehicle_registration: string | null;
  driver_name: string | null;
  odometer_km: number | null;
  requested_litres: number | null;
  filled_litres: number | null;
  parking_nights: number | null;
  parking_fee: number | null;
  fuel_price_per_litre: number | null;
  total_amount: number;
  ordered_at: string;
  completed_at: string | null;
  expires_at: string | null;
  notes: string | null;
  clients: Array<{ name: string }> | { name: string } | null;
  depots: Array<{ name: string }> | { name: string } | null;
}

interface IssueRow {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: IssuePriority;
  status: IssueStatus;
  reported_by: string;
  source: string;
  order_reference: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
  customer_update_at: string | null;
  customer_seen_at: string | null;
}

interface ActivityLogRow {
  id: string;
  action: string;
  details: string;
  performed_at: string;
  admin_email: string;
}

interface ImportBatchRow {
  id: string;
  filename: string;
  rows_in_file: number;
  imported: number;
  skipped: number;
  dropped_in_parser: number;
  order_numbers: string[];
  imported_at: string;
  imported_by_email: string;
}

function joinAddress(client: ClientRow) {
  return [
    client.address_line_1,
    client.address_line_2,
    client.city,
    client.province,
    client.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

function relationValue<T extends Record<string, unknown>, K extends keyof T>(
  relation: T[] | T | null,
  key: K,
) {
  if (Array.isArray(relation)) return relation[0]?.[key];
  return relation?.[key];
}

export async function loadPortalData(
  user: User,
): Promise<Pick<AppState, "currentUser" | "customers" | "clientDirectory" | "transactions" | "issues" | "activityLogs" | "importBatches">> {
  const supabase = requireSupabase();
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, email, display_name, role, admin_permissions, must_change_password, is_active, client_id")
    .eq("is_active", true)
    .order("display_name");

  if (profileError) throw profileError;

  const profiles = (profileData ?? []) as ProfileRow[];
  const signedInProfile = profiles.find((profile) => profile.user_id === user.id);
  if (!signedInProfile) {
    throw new Error(
      "Your sign-in worked, but your portal account isn't fully set up yet. Please contact FuelSearch support.",
    );
  }

  let clientQuery = supabase
    .from("clients")
    .select(
      "id, user_id, name, contact_name, contact_email, phone, vat_number, registration_number, address_line_1, address_line_2, city, province, postal_code, is_active, created_at",
    )
    .order("name");
  if (signedInProfile.role === "customer") {
    clientQuery = clientQuery.eq("is_active", true);
  }
  const { data: clientData, error: clientError } = await clientQuery;

  if (clientError) throw clientError;

  const clients = (clientData ?? []) as ClientRow[];
  if (clients.length === 0 && signedInProfile.role === "customer") {
    throw new Error(
      "Your sign-in worked, but your company account isn't active yet. Please contact FuelSearch support to finish setting up your access.",
    );
  }

  const transactionData: TransactionRow[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data: page, error: transactionError } = await supabase
      .from("transactions")
      .select(
        "id, order_number, status, vehicle_registration, driver_name, odometer_km, requested_litres, filled_litres, parking_nights, parking_fee, fuel_price_per_litre, total_amount, ordered_at, completed_at, expires_at, notes, clients(name), depots(name)",
      )
      .in("client_id", clients.map((client) => client.id).length ? clients.map((client) => client.id) : [-1])
      .order("ordered_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (transactionError) throw transactionError;
    transactionData.push(...((page ?? []) as TransactionRow[]));
    if ((page?.length ?? 0) < pageSize) break;
  }

  const [{ data: issueData, error: issueError }, { data: activityData, error: activityError }, { data: importData, error: importError }] = await Promise.all([
    supabase
      .from("issues")
      .select("id, title, description, category, priority, status, reported_by, source, order_reference, resolution_notes, created_at, updated_at, customer_update_at, customer_seen_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("activity_logs")
      .select("id, action, details, performed_at, admin_email")
      .order("performed_at", { ascending: false })
      .limit(500),
    supabase
      .from("import_batches")
      .select("id, filename, rows_in_file, imported, skipped, dropped_in_parser, order_numbers, imported_at, imported_by_email")
      .order("imported_at", { ascending: false })
      .limit(200),
  ]);
  if (issueError) throw issueError;
  if (activityError) throw activityError;
  if (importError) throw importError;

  const currentUser: PortalUser = {
    id: user.id,
    email: signedInProfile.email,
    displayName: signedInProfile.display_name,
    role: signedInProfile.role,
    clientName: signedInProfile.role === "customer"
      ? clients.find((client) => client.id === signedInProfile.client_id)?.name
      : undefined,
    mustChangePassword: signedInProfile.must_change_password,
  };

  const profileCustomers: Customer[] = profiles.map((profile) => {
    const ownedClient = clients.find((client) => client.id === profile.client_id);
    return {
      id: profile.user_id,
      email: profile.email,
      clientName: ownedClient?.name ?? (profile.role === "customer" ? "Unassigned client" : "FuelSearch"),
      displayName: profile.display_name,
      role: profile.role,
      adminPermissions: profile.role === "admin" ? profile.admin_permissions ?? undefined : undefined,
      vatNumber: ownedClient?.vat_number ?? undefined,
      registration: ownedClient?.registration_number ?? undefined,
      address: ownedClient ? joinAddress(ownedClient) || undefined : undefined,
      clientId: profile.client_id ? String(profile.client_id) : undefined,
    };
  });

  const customers = profileCustomers;

  const clientDirectory: ClientDirectoryEntry[] = clients.map((client) => ({
    id: String(client.id),
    clientName: client.name,
    contactPerson: client.contact_name ?? undefined,
    email: client.contact_email ?? undefined,
    phone: client.phone ?? undefined,
    address: joinAddress(client) || undefined,
    createdAt: client.created_at,
  }));

  const transactions: Transaction[] = transactionData.map((transaction) => ({
    id: String(transaction.id),
    order: transaction.order_number,
    clientName: String(relationValue(transaction.clients, "name") ?? ""),
    depot: String(relationValue(transaction.depots, "name") ?? "Unassigned depot"),
    vehicle: transaction.vehicle_registration ?? "-",
    vehicleOdoReading: transaction.odometer_km ?? undefined,
    driver: transaction.driver_name ?? undefined,
    status: transaction.status,
    requestedFuelL: transaction.requested_litres ?? undefined,
    filledFuelL: transaction.filled_litres ?? undefined,
    parkingNights: transaction.parking_nights ?? undefined,
    parkingFee: transaction.parking_fee ?? undefined,
    fuelPricePerL: transaction.fuel_price_per_litre ?? undefined,
    totalPrice: transaction.total_amount,
    createdAt: transaction.ordered_at,
    completedAt: transaction.completed_at ?? undefined,
    expiresAt: transaction.expires_at ?? undefined,
    notes: transaction.notes ?? undefined,
  }));

  const issues: Issue[] = ((issueData ?? []) as IssueRow[]).map((issue) => ({
    id: issue.id,
    title: issue.title,
    description: issue.description,
    category: issue.category,
    priority: issue.priority,
    status: issue.status,
    reportedBy: issue.reported_by,
    source: issue.source,
    orderRef: issue.order_reference ?? undefined,
    resolutionNotes: issue.resolution_notes ?? undefined,
    loggedAt: issue.created_at,
    updatedAt: issue.updated_at,
    customerUpdateAt: issue.customer_update_at ?? undefined,
    customerSeenAt: issue.customer_seen_at ?? undefined,
  }));

  const activityLogs: ActivityLog[] = ((activityData ?? []) as ActivityLogRow[]).map((log) => ({
    id: log.id,
    action: log.action,
    adminEmail: log.admin_email,
    details: log.details,
    performedAt: log.performed_at,
  }));

  const importBatches: ImportBatch[] = ((importData ?? []) as ImportBatchRow[]).map((batch) => ({
    id: batch.id,
    filename: batch.filename,
    importedAt: batch.imported_at,
    importedBy: batch.imported_by_email,
    rowsInFile: batch.rows_in_file,
    imported: batch.imported,
    skipped: batch.skipped,
    droppedInParser: batch.dropped_in_parser,
    orderNumbers: batch.order_numbers,
  }));

  return { currentUser, customers, clientDirectory, transactions, issues, activityLogs, importBatches };
}
