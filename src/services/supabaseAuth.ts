import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { requireSupabase } from "../lib/supabase";

export async function getSupabaseSession() {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function requestMagicLink(email: string, redirectTo = window.location.origin) {
  const { error } = await requireSupabase().auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
    },
  });

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
