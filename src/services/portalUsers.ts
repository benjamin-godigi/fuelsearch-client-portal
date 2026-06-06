import type { Customer } from "../types";
import { requireSupabase } from "../lib/supabase";

interface ManagedUserResponse {
  user?: {
    id: string;
    email: string;
    displayName: string;
    role: Customer["role"];
  };
  temporaryPassword?: string;
  ok?: boolean;
  error?: string;
}

async function invokeUserFunction(body: Record<string, unknown>) {
  const { data, error } = await requireSupabase().functions.invoke<ManagedUserResponse>(
    "manage-portal-user",
    { body },
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function userPayload(customer: Customer) {
  return {
    userId: customer.id.startsWith("customer-") ? undefined : customer.id,
    email: customer.email.trim().toLowerCase(),
    displayName: customer.displayName.trim(),
    role: customer.role,
    adminPermissions: customer.adminPermissions ?? {},
    clientName: customer.clientName.trim(),
    address: customer.address?.trim(),
    vatNumber: customer.vatNumber?.trim(),
    registration: customer.registration?.trim(),
  };
}

export async function createPortalUser(customer: Customer) {
  return invokeUserFunction({ action: "create", ...userPayload(customer) });
}

export async function updatePortalUser(customer: Customer) {
  return invokeUserFunction({ action: "update", ...userPayload(customer) });
}

export async function deactivatePortalUser(userId: string) {
  await invokeUserFunction({ action: "deactivate", userId });
}

export async function resetPortalUserPassword(userId: string) {
  return invokeUserFunction({ action: "reset-password", userId });
}

export async function completeRequiredPasswordChange(password: string) {
  const supabase = requireSupabase();
  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) throw passwordError;

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error("Could not verify the signed-in user.");

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ must_change_password: false })
    .eq("user_id", authData.user.id);
  if (profileError) throw profileError;
}
