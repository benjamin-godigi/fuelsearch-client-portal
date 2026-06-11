import type {
  ImportBatch,
  Issue,
  Transaction,
  TransactionChange,
  TransactionFieldDelta,
} from "../types";
import { requireSupabase } from "../lib/supabase";

async function currentUser() {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error || !data.user) throw error ?? new Error("Authentication required.");
  return data.user;
}

function normalizedName(name: string) {
  return name.trim().toLowerCase();
}

async function clientIdsForNames(clientNames: string[]) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name");
  if (error) throw error;

  const idsByName = new Map(
    (data ?? []).map((client) => [normalizedName(String(client.name)), client.id as number]),
  );
  const missingClients = [...new Map(
    clientNames
      .map((name) => name.trim())
      .filter(Boolean)
      .filter((name) => !idsByName.has(normalizedName(name)))
      .map((name) => [normalizedName(name), name]),
  ).values()];

  if (missingClients.length > 0) {
    const { data: created, error: insertError } = await supabase
      .from("clients")
      .insert(missingClients.map((name) => ({
        name,
        user_id: null,
        is_active: false,
      })))
      .select("id, name");
    if (insertError) throw insertError;
    for (const client of created ?? []) {
      idsByName.set(normalizedName(String(client.name)), client.id as number);
    }
  }

  return idsByName;
}

async function lookupClientId(clientName: string) {
  const name = clientName.trim();
  if (!name) return null;

  const { data, error } = await requireSupabase()
    .from("clients")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as number | undefined) ?? null;
}

async function depotIdForName(depotName: string) {
  const name = depotName.trim();
  if (!name || name === "Unassigned depot") return null;

  const supabase = requireSupabase();
  const { data: existing, error: selectError } = await supabase
    .from("depots")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id as number;

  const { data: created, error: insertError } = await supabase
    .from("depots")
    .insert({ name })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id as number;
}

async function depotIdsForNames(depotNames: string[]) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.from("depots").select("id, name");
  if (error) throw error;

  const idsByName = new Map(
    (data ?? []).map((depot) => [normalizedName(String(depot.name)), depot.id as number]),
  );
  const missingDepots = [...new Map(
    depotNames
      .map((name) => name.trim())
      .filter((name) => name && name !== "Unassigned depot")
      .filter((name) => !idsByName.has(normalizedName(name)))
      .map((name) => [normalizedName(name), name]),
  ).values()];

  if (missingDepots.length > 0) {
    const { data: created, error: insertError } = await supabase
      .from("depots")
      .insert(missingDepots.map((name) => ({ name })))
      .select("id, name");
    if (insertError) throw insertError;
    for (const depot of created ?? []) {
      idsByName.set(normalizedName(String(depot.name)), depot.id as number);
    }
  }

  return idsByName;
}

async function transactionRow(transaction: Transaction, clientId?: number, depotId?: number | null) {
  const resolvedClientId = clientId ?? (await clientIdsForNames([transaction.clientName]))
    .get(normalizedName(transaction.clientName));
  if (!resolvedClientId) throw new Error(`Could not create or find client "${transaction.clientName}".`);

  return {
    client_id: resolvedClientId,
    depot_id: depotId === undefined ? await depotIdForName(transaction.depot) : depotId,
    order_number: transaction.order.trim(),
    status: transaction.status,
    vehicle_registration: transaction.vehicle.trim() || null,
    driver_name: transaction.driver?.trim() || null,
    odometer_km: transaction.vehicleOdoReading ?? null,
    requested_litres: transaction.requestedFuelL ?? null,
    filled_litres: transaction.filledFuelL ?? null,
    parking_nights: transaction.parkingNights ?? null,
    parking_fee: transaction.parkingFee ?? null,
    fuel_price_per_litre: transaction.fuelPricePerL ?? null,
    total_amount: transaction.totalPrice,
    ordered_at: transaction.createdAt,
    completed_at: transaction.completedAt ?? null,
    expires_at: transaction.expiresAt ?? null,
    notes: transaction.notes?.trim() || null,
  };
}

export async function saveTransaction(transaction: Transaction) {
  const supabase = requireSupabase();
  const row = await transactionRow(transaction);
  const existingId = /^\d+$/.test(transaction.id) ? Number(transaction.id) : null;
  const query = existingId
    ? supabase.from("transactions").update(row).eq("id", existingId)
    : supabase.from("transactions").upsert(row, { onConflict: "order_number" });
  const { data, error } = await query.select("id").single();
  if (error) throw error;
  return String(data.id);
}

export async function deleteTransaction(transactionId: string) {
  if (!/^\d+$/.test(transactionId)) return;
  const { error } = await requireSupabase()
    .from("transactions")
    .delete()
    .eq("id", Number(transactionId));
  if (error) throw error;
}

export async function importTransactions(
  transactions: Transaction[],
  batch: ImportBatch,
  onProgress?: (processed: number, total: number) => void,
) {
  const [clientIds, depotIds] = await Promise.all([
    clientIdsForNames(transactions.map((transaction) => transaction.clientName)),
    depotIdsForNames(transactions.map((transaction) => transaction.depot)),
  ]);
  const rows = await Promise.all(transactions.map((transaction) => {
    const clientId = clientIds.get(normalizedName(transaction.clientName));
    const depotId = depotIds.get(normalizedName(transaction.depot)) ?? null;
    return transactionRow(transaction, clientId, depotId);
  }));

  const supabase = requireSupabase();
  const importedRows: Array<{ id: number; order_number: string }> = [];
  const chunkSize = 250;
  onProgress?.(0, rows.length);
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { data, error: transactionError } = await supabase
      .from("transactions")
      .upsert(chunk, { onConflict: "order_number" })
      .select("id, order_number");
    if (transactionError) {
      throw new Error(`Import stopped after ${index.toLocaleString()} rows: ${transactionError.message}`);
    }
    importedRows.push(...((data ?? []) as Array<{ id: number; order_number: string }>));
    onProgress?.(Math.min(index + chunk.length, rows.length), rows.length);
  }

  const user = await currentUser();
  const { data: batchData, error: batchError } = await supabase.from("import_batches").insert({
    imported_by: user.id,
    imported_by_email: user.email ?? "unknown",
    filename: batch.filename,
    rows_in_file: batch.rowsInFile,
    imported: batch.imported,
    skipped: 0,
    dropped_in_parser: 0,
    order_numbers: transactions.map((transaction) => transaction.order),
  }).select("id").single();
  if (batchError) throw batchError;

  const idsByOrder = new Map(
    (importedRows ?? []).map((row) => [String(row.order_number), String(row.id)]),
  );
  const savedRows = transactions.map((transaction) => ({
    ...transaction,
    id: idsByOrder.get(transaction.order) ?? transaction.id,
  }));
  return { rows: savedRows, batchId: String(batchData.id) };
}

export async function resetTransactions() {
  const { error } = await requireSupabase()
    .from("transactions")
    .delete()
    .gte("id", 0);
  if (error) throw error;
}

export async function createIssue(issue: Issue) {
  const user = await currentUser();
  // The set_issue_client DB trigger has the final say on client_id: for a
  // reporter who belongs to a client account it overrides this value with their
  // own account. This supplied value only takes effect for support staff logging
  // a request on behalf of the client they are previewing (see
  // 20260609130000_issue_client_admin_fallback.sql).
  const clientId = issue.clientName ? await lookupClientId(issue.clientName) : null;
  const { data, error } = await requireSupabase()
    .from("issues")
    .insert({
      reporter_user_id: user.id,
      client_id: clientId,
      title: issue.title,
      description: issue.description,
      category: issue.category,
      priority: issue.priority,
      status: issue.status,
      reported_by: issue.reportedBy,
      source: issue.source,
      order_reference: issue.orderRef ?? null,
      resolution_notes: issue.resolutionNotes ?? null,
    })
    .select("id, created_at, updated_at")
    .single();
  if (error) throw error;
  return { ...issue, id: data.id as string, loggedAt: data.created_at as string, updatedAt: data.updated_at as string };
}

export async function updateIssue(issue: Issue) {
  const { error } = await requireSupabase()
    .from("issues")
    .update({
      status: issue.status,
      priority: issue.priority,
      resolution_notes: issue.resolutionNotes ?? null,
    })
    .eq("id", issue.id);
  if (error) throw error;
}

export async function deleteIssue(issueId: string) {
  const { error } = await requireSupabase()
    .from("issues")
    .delete()
    .eq("id", issueId);
  if (error) throw error;
}

export async function markIssueSeen(issueId: string) {
  const { error } = await requireSupabase().rpc("mark_issue_seen", { issue_id: issueId });
  if (error) throw error;
}

// Stored transaction columns worth tracking in the change log, in display order.
// Derived/display-only fields (profit, costPrice*, totalCostPrice, nightsActual)
// are intentionally excluded — they are not persisted, so they have no history.
type TrackedField = {
  key: keyof Transaction;
  label: string;
  format: (value: Transaction[keyof Transaction]) => string;
};

const moneyText = (value: unknown) =>
  value == null || value === "" ? "—" : `R ${Number(value).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const litreText = (value: unknown) => (value == null || value === "" ? "—" : `${Number(value).toLocaleString("en-ZA")} L`);
const numberText = (value: unknown) => (value == null || value === "" ? "—" : String(value));
const dateText = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("en-ZA");
};
const plainText = (value: unknown) => (value == null || value === "" ? "—" : String(value));

const TRACKED_FIELDS: TrackedField[] = [
  { key: "status", label: "Status", format: plainText },
  { key: "requestedFuelL", label: "Requested (L)", format: litreText },
  { key: "filledFuelL", label: "Filled (L)", format: litreText },
  { key: "fuelPricePerL", label: "Fuel Price / L", format: moneyText },
  { key: "totalPrice", label: "Total Price", format: moneyText },
  { key: "parkingNights", label: "Parking Nights", format: numberText },
  { key: "parkingFee", label: "Parking Fee", format: moneyText },
  { key: "depot", label: "Depot", format: plainText },
  { key: "vehicle", label: "Vehicle", format: plainText },
  { key: "driver", label: "Driver", format: plainText },
  { key: "completedAt", label: "Completed At", format: dateText },
  { key: "expiresAt", label: "Expires At", format: dateText },
  { key: "notes", label: "Notes", format: plainText },
];

// True when two stored values are materially equal (handles number vs string,
// null vs undefined vs "", and ISO-date equivalence).
function sameValue(left: unknown, right: unknown): boolean {
  const leftEmpty = left == null || left === "";
  const rightEmpty = right == null || right === "";
  if (leftEmpty || rightEmpty) return leftEmpty && rightEmpty;
  if (typeof left === "number" || typeof right === "number") {
    const ln = Number(left);
    const rn = Number(right);
    if (!Number.isNaN(ln) && !Number.isNaN(rn)) return ln === rn;
  }
  return String(left).trim() === String(right).trim();
}

export interface TransactionDiff {
  deltas: TransactionFieldDelta[];
  statusFrom?: string;
  statusTo?: string;
}

// Compare a previous transaction against its new state and return only the
// fields that actually changed. `previous` undefined means a brand-new order.
export function diffTransaction(previous: Transaction | undefined, next: Transaction): TransactionDiff {
  const deltas: TransactionFieldDelta[] = [];
  for (const field of TRACKED_FIELDS) {
    const before = previous?.[field.key];
    const after = next[field.key];
    if (previous && sameValue(before, after)) continue;
    if (!previous && (after == null || after === "")) continue;
    deltas.push({
      field: String(field.key),
      label: field.label,
      from: previous ? field.format(before) : "—",
      to: field.format(after),
    });
  }
  const statusChanged = !previous || !sameValue(previous.status, next.status);
  return {
    deltas,
    statusFrom: previous?.status,
    statusTo: statusChanged ? next.status : undefined,
  };
}

export interface NewTransactionChange {
  transactionId?: string;
  orderNumber: string;
  source: TransactionChange["source"];
  importBatchId?: string;
  diff: TransactionDiff;
}

// Append change-log rows. Best-effort: callers should not let a failure here
// break the actual import/save. Rows with no deltas are skipped.
export async function recordTransactionChanges(records: NewTransactionChange[]) {
  const meaningful = records.filter((record) => record.diff.deltas.length > 0);
  if (meaningful.length === 0) return;
  const user = await currentUser();
  const changedByEmail = user.email ?? "unknown";
  const rows = meaningful.map((record) => ({
    transaction_id: record.transactionId && /^\d+$/.test(record.transactionId) ? Number(record.transactionId) : null,
    order_number: record.orderNumber,
    source: record.source,
    import_batch_id: record.importBatchId ?? null,
    changed_by_email: changedByEmail,
    status_from: record.diff.statusFrom ?? null,
    status_to: record.diff.statusTo ?? null,
    changes: Object.fromEntries(record.diff.deltas.map((delta) => [delta.field, { label: delta.label, from: delta.from, to: delta.to }])),
  }));
  const { error } = await requireSupabase().from("transaction_changes").insert(rows);
  if (error) throw error;
}

export async function writeActivityLog(action: string, details: string) {
  const user = await currentUser();
  const { error } = await requireSupabase()
    .from("activity_logs")
    .insert({ admin_user_id: user.id, admin_email: user.email ?? "unknown", action, details });
  if (error) throw error;
}
