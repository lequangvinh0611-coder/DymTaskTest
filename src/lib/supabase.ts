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

// Helper to broadcast custom events to all active clients via Supabase Realtime Channel
export const safeBroadcast = (event: string, payload: any = {}) => {
  const channel = (window as any).globalRealtimeChannel;
  if (channel) {
    channel.send({
      type: 'broadcast',
      event,
      payload
    }).catch((err: any) => {
      console.warn(`[Realtime Broadcast] Failed to send event ${event}:`, err);
    });
  }
};

