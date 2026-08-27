import { createClient, type User } from '@supabase/supabase-js';
import type { AccountIdentity } from '../types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();

export const isAuthConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isAuthConfigured
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

export function accountFromSupabaseUser(user: User): AccountIdentity {
  const displayName = typeof user.user_metadata?.display_name === 'string'
    ? user.user_metadata.display_name
    : typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name
      : user.email || 'Student';
  return { userId: user.id, email: user.email || '', displayName };
}

export async function signUpWithEmail(email: string, password: string, displayName: string) {
  if (!supabase) throw new Error('Account service is not configured yet.');
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin },
  });
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase) throw new Error('Account service is not configured yet.');
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Account service is not configured yet.');
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
}

export async function signOutAccount() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
