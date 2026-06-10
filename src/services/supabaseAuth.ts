import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { requireSupabase } from "../lib/supabase";

export async function signInWithPassword(email: string, password: string) {
  const { error } = await requireSupabase().auth.signInWithPassword({
    email,
    password,
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
