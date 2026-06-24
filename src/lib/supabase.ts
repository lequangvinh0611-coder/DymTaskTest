/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

let rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
if (rawUrl.endsWith('/rest/v1/')) {
  rawUrl = rawUrl.replace('/rest/v1/', '');
} else if (rawUrl.endsWith('/rest/v1')) {
  rawUrl = rawUrl.replace('/rest/v1', '');
}
const supabaseUrl = rawUrl;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'dymtask_secure_auth_token'
  }
});

// Realtime & Egress optimization: Track local writes/mutations to ignore self-triggered DB changes
const localMutations = new Map<string, number>();

export const trackLocalMutation = (id: string) => {
  if (!id) return;
  localMutations.set(id, Date.now());
  setTimeout(() => {
    const ts = localMutations.get(id);
    if (ts && Date.now() - ts >= 5000) {
      localMutations.delete(id);
    }
  }, 5000);
};

export const isLocalMutation = (id: string): boolean => {
  if (!id) return false;
  const timestamp = localMutations.get(id);
  if (!timestamp) return false;
  return Date.now() - timestamp < 3500;
};
