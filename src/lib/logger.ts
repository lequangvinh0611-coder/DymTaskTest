import { supabase } from './supabase';

export const logger = {
  log: async (action: string, description: string, metadata: any = {}) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let dbUserId: string | null = null;
      let userName: string = user.email?.split('@')[0] || 'Unknown';

      // Always try to fetch profile by email rather than ID because the ID might be Auth UID,
      // which might verify but differs or hasn't synced into the users table.
      if (user.email) {
        const { data: profile } = await supabase
          .from('users')
          .select('id, name')
          .eq('email', user.email)
          .single() as any;

        if (profile) {
          dbUserId = profile.id;
          userName = profile.name || userName;
        }
      }

      await supabase.from('audit_logs').insert({
        action,
        description,
        user_id: dbUserId, // Fall back to null if not present in public.users, bypassing FK constraint errors
        user_name: userName,
        metadata,
      });
    } catch (err) {
      console.error('[Logger] Failed to log action:', err);
    }
  }
};
