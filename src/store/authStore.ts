import { create } from 'zustand';
import { supabase } from '../lib/supabase';

let isAuthInitializing = false;
let isAuthInitialized = false;

interface AuthState {
  session: any | null;
  profile: any | null;
  currentUser?: any | null;
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  initializeAuth: () => Promise<void>;
  setupListenerOnce: () => void;
  setSession: (session: any | null) => void;
  setProfile: (profile: any | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  signOut: () => Promise<void>;
  fetchProfile: (email: string) => Promise<any | null>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  currentUser: null,
  loading: true,
  isLoading: true,
  error: null,

  setSession: (session) => {
    console.log('[AuthStore] setSession called', session);
    set({ session });
  },
  setProfile: (profile) => {
    console.log('[AuthStore] setProfile called', profile);
    set({ profile, currentUser: profile });
  },
  setLoading: (loading) => set({ loading, isLoading: loading }),
  setError: (error) => set({ error }),

  fetchProfile: async (email: string) => {
    console.log('[AuthStore] fetchProfile database query for email:', email);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
      
      if (error) {
        console.error('[AuthStore] fetchProfile error:', error);
        return null;
      }
      return data;
    } catch (err) {
      console.error('[AuthStore] fetchProfile exception:', err);
      return null;
    }
  },

  initializeAuth: async () => {
    if (isAuthInitializing || isAuthInitialized) {
      console.log('[AuthStore] initializeAuth skipped due to lock');
      return;
    }
    isAuthInitializing = true;

    console.log('[AuthStore] Initializing user session...');
    set({ loading: true, isLoading: true, error: null });
    try {
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;

      if (!session) {
        set({ session: null, profile: null, currentUser: null, error: null });
        get().setupListenerOnce();
        return;
      }

      const email = session.user?.email || '';
      console.log('[AuthStore] initializeAuth resolved email:', email);

      const { data: profileData, error: profileErr } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (profileErr) {
        console.error('[AuthStore] initializeAuth profile error:', profileErr);
        await supabase.auth.signOut();
        throw new Error('An error occurred during account verification. Please contact Admin.');
      }

      if (!profileData) {
        console.warn('[AuthStore] No profile in users table for email:', email);
        await supabase.auth.signOut();
        throw new Error('Account has not been authorized');
      }

      if (profileData.status !== 'ACTIVE') {
        console.warn('[AuthStore] Login attempted for INACTIVE profile:', email);
        await supabase.auth.signOut();
        throw new Error('Your account has been locked or deactivated. Please contact Admin.');
      }

      set({
        session,
        profile: profileData,
        currentUser: profileData,
        error: null
      });

      // Register listener after state is fully initialized from the getSession flow
      get().setupListenerOnce();
    } catch (err: any) {
      console.error('[AuthStore] initializeAuth exception', err);
      set({
        session: null,
        profile: null,
        currentUser: null,
        error: err.message || 'Error initializing login session'
      });
      get().setupListenerOnce();
    } finally {
      isAuthInitializing = false;
      isAuthInitialized = true;
      // BẮT BUỘC phải dùng try...catch...finally. Khối finally phải luôn được thực thi
      set({ loading: false, isLoading: false });
    }
  },

  setupListenerOnce: () => {
    const existingListener = (window as any)._auth_listener_registered;
    if (existingListener) return;

    console.log('[AuthStore] Setting up onAuthStateChange listener...');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[AuthStore] onAuthStateChange event:', event, session?.user?.email);
      
      if (session) {
        const email = session.user?.email || '';
        const currentProfile = get().profile;
        if (currentProfile && currentProfile.email === email) {
          set({ session, loading: false, isLoading: false, error: null });
          return;
        }

        set({ loading: true, isLoading: true, error: null });
        try {
          const { data: profileData, error: profileErr } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();

          if (profileErr) {
            console.error('[AuthStore] Listener profile check error:', profileErr);
            await supabase.auth.signOut();
            set({ session: null, profile: null, currentUser: null, error: 'Error checking access permissions.' });
            return;
          }

          if (!profileData) {
            console.warn('[AuthStore] Listener unauthorized email:', email);
            await supabase.auth.signOut();
            set({ session: null, profile: null, currentUser: null, error: 'Account has not been authorized' });
            return;
          }

          if (profileData.status !== 'ACTIVE') {
            console.warn('[AuthStore] Listener inactive account email:', email);
            await supabase.auth.signOut();
            set({ session: null, profile: null, currentUser: null, error: 'Your account has been locked or deactivated.' });
            return;
          }

          set({ session, profile: profileData, currentUser: profileData, error: null });
        } catch (err: any) {
          console.error('[AuthStore] Listener exception:', err);
          await supabase.auth.signOut();
          set({ session: null, profile: null, currentUser: null, error: err.message || 'Error authenticating account.' });
        } finally {
          set({ loading: false, isLoading: false });
        }
      } else {
        set({ session: null, profile: null, currentUser: null, loading: false, isLoading: false, error: null });
      }
    });

    (window as any)._auth_listener_registered = subscription;
  },

  signOut: async () => {
    console.log('[AuthStore] Signing out and resetting session...');
    isAuthInitialized = false;
    set({ loading: true, isLoading: true });
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[AuthStore] SignOut error:', err);
    } finally {
      set({
        session: null,
        profile: null,
        currentUser: null,
        loading: false,
        isLoading: false,
        error: null
      });
    }
  }
}));

// Expose setupListenerOnce as utility interface
(useAuthStore as any).setupListenerOnce = () => {
  useAuthStore.getState().setupListenerOnce();
};
