import type { User } from "@supabase/supabase-js";
import type { ClientDirectoryEntry, Customer, DemoUser, Transaction, TransactionStatus } from "../types";
import { requireSupabase } from "../lib/supabase";
import type { AppState } from "./store";

interface ClientRow {
  id: number;
  user_id: string;
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
  created_at: string;
}

interface ProfileRow {
  user_id: string;
  email: string;
  display_name: string;
  role: "super_admin" | "admin" | "customer";
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

function relationName(relation: TransactionRow["clients"]) {
  if (Array.isArray(relation)) return relation[0]?.name;
  return relation?.name;
}

export async function loadPortalData(
  user: User,
): Promise<Pick<AppState, "currentUser" | "customers" | "clientDirectory" | "transactions">> {
  const supabase = requireSupabase();
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, email, display_name, role")
    .order("display_name");

  if (profileError) throw profileError;

  const profiles = (profileData ?? []) as ProfileRow[];
  const signedInProfile = profiles.find((profile) => profile.user_id === user.id);
  if (!signedInProfile) {
    throw new Error("Your login is valid, but no portal profile is linked to it yet.");
  }

  const { data: clientData, error: clientError } = await supabase
    .from("clients")
    .select(
      "id, user_id, name, contact_name, contact_email, phone, vat_number, registration_number, address_line_1, address_line_2, city, province, postal_code, created_at",
    )
    .eq("is_active", true)
    .order("name");

  if (clientError) throw clientError;

  const clients = (clientData ?? []) as ClientRow[];
  if (clients.length === 0 && signedInProfile.role === "customer") {
    throw new Error("Your login is valid, but no active client account is linked to it yet.");
  }

  const { data: transactionData, error: transactionError } = await supabase
    .from("transactions")
    .select(
      "id, order_number, status, vehicle_registration, driver_name, odometer_km, requested_litres, filled_litres, parking_nights, parking_fee, fuel_price_per_litre, total_amount, ordered_at, completed_at, expires_at, notes, clients(name), depots(name)",
    )
    .in("client_id", clients.map((client) => client.id).length ? clients.map((client) => client.id) : [-1])
    .order("ordered_at", { ascending: false });

  if (transactionError) throw transactionError;

  const currentUser: DemoUser = {
    id: user.id,
    email: signedInProfile.email,
    displayName: signedInProfile.display_name,
    role: signedInProfile.role,
    clientName: signedInProfile.role === "customer" ? clients[0]?.name : undefined,
  };

  const profileCustomers: Customer[] = profiles.map((profile) => {
    const ownedClient = clients.find((client) => client.user_id === profile.user_id);
    return {
      id: profile.user_id,
      email: profile.email,
      clientName: ownedClient?.name ?? (profile.role === "customer" ? "Unassigned client" : "FuelSearch"),
      displayName: profile.display_name,
      role: profile.role,
      vatNumber: ownedClient?.vat_number ?? undefined,
      registration: ownedClient?.registration_number ?? undefined,
      address: ownedClient ? joinAddress(ownedClient) || undefined : undefined,
    };
  });

  const clientCustomers: Customer[] = clients
    .filter((client) => !profiles.some((profile) => profile.user_id === client.user_id))
    .map((client) => ({
    id: String(client.id),
    email: client.contact_email ?? user.email ?? "",
    clientName: client.name,
    displayName: client.contact_name ?? client.name,
    role: "customer",
    vatNumber: client.vat_number ?? undefined,
    registration: client.registration_number ?? undefined,
    address: joinAddress(client) || undefined,
  }));
  const customers = [...profileCustomers, ...clientCustomers];

  const clientDirectory: ClientDirectoryEntry[] = clients.map((client) => ({
    id: String(client.id),
    clientName: client.name,
    contactPerson: client.contact_name ?? undefined,
    email: client.contact_email ?? undefined,
    phone: client.phone ?? undefined,
    address: joinAddress(client) || undefined,
    createdAt: client.created_at,
  }));

  const transactions: Transaction[] = ((transactionData ?? []) as TransactionRow[]).map((transaction) => ({
    id: String(transaction.id),
    order: transaction.order_number,
    clientName: relationName(transaction.clients) ?? "",
    depot: relationName(transaction.depots) ?? "Unassigned depot",
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

  return { currentUser, customers, clientDirectory, transactions };
}
