import type { ImportBatch, Issue, Transaction } from "../types";
import { requireSupabase } from "../lib/supabase";

async function currentUser() {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error || !data.user) throw error ?? new Error("Authentication required.");
  return data.user;
}

async function clientIdForName(clientName: string) {
  const { data, error } = await requireSupabase()
    .from("clients")
    .select("id")
    .eq("name", clientName.trim())
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No active client named "${clientName}" exists.`);
  return data.id as number;
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

async function transactionRow(transaction: Transaction) {
  return {
    client_id: await clientIdForName(transaction.clientName),
    depot_id: await depotIdForName(transaction.depot),
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

export async function importTransactions(transactions: Transaction[], batch: ImportBatch) {
  const rows = [];
  for (const transaction of transactions) {
    rows.push(await transactionRow(transaction));
  }

  const supabase = requireSupabase();
  const { data: importedRows, error: transactionError } = await supabase
    .from("transactions")
    .upsert(rows, { onConflict: "order_number" })
    .select("id, order_number");
  if (transactionError) throw transactionError;

  const user = await currentUser();
  const { error: batchError } = await supabase.from("import_batches").insert({
    imported_by: user.id,
    imported_by_email: user.email ?? "unknown",
    filename: batch.filename,
    rows_in_file: batch.rowsInFile,
    imported: batch.imported,
    skipped: batch.skipped,
    dropped_in_parser: batch.droppedInParser,
    order_numbers: batch.orderNumbers,
  });
  if (batchError) throw batchError;

  const idsByOrder = new Map(
    (importedRows ?? []).map((row) => [String(row.order_number), String(row.id)]),
  );
  return transactions.map((transaction) => ({
    ...transaction,
    id: idsByOrder.get(transaction.order) ?? transaction.id,
  }));
}

export async function createIssue(issue: Issue) {
  const user = await currentUser();
  const { data, error } = await requireSupabase()
    .from("issues")
    .insert({
      reporter_user_id: user.id,
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

export async function writeActivityLog(action: string, details: string) {
  const user = await currentUser();
  const { error } = await requireSupabase()
    .from("activity_logs")
    .insert({ admin_user_id: user.id, admin_email: user.email ?? "unknown", action, details });
  if (error) throw error;
}
