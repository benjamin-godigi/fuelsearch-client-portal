import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { requireSupabase } from "../lib/supabase";

function appUrl(path = "/") {
  return new URL(path, window.location.origin).toString();
}

export async function getSupabaseSession() {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInWithPassword(email: string, password: string) {
  const { error } = await requireSupabase().auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: appUrl("/reset-password"),
  });

  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await requireSupabase().auth.updateUser({ password });
  if (error) throw error;
}

export async function signOutFromSupabase() {
  const { error } = await requireSupabase().auth.signOut();
  if (error) throw error;
}

export function onSupabaseAuthChange(
  listener: (event: AuthChangeEvent, session: Session | null) => void,
) {
  const { data } = requireSupabase().auth.onAuthStateChange(listener);
  return () => data.subscription.unsubscribe();
}
