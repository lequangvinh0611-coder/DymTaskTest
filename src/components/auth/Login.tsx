import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { motion } from 'motion/react';
import { ShieldAlert } from 'lucide-react';

const Login: React.FC = () => {
  const { error: authError, setError: setAuthError } = useAuthStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (authError) {
      setErrorMsg(authError);
    }
  }, [authError]);

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setAuthError(null);
    
    try {
      const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      const redirectUrl = baseUrl.replace(/\/$/, '');
      
      console.log('[Auth] Google Login Start with Redirect URL:', redirectUrl);
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false
        },
      });

      if (error) throw error;
    } catch (error: any) {
      console.error('Login error detail:', error);
      setErrorMsg(error.message || 'An error occurred during Google Auth login.');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0F172A] relative overflow-y-auto py-12 px-4 selection:bg-indigo-500/20 select-none">
      {/* Ambient background glow dots */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500 rounded-full blur-[140px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-900 rounded-full blur-[140px]"></div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-lg"
      >
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 p-8 sm:p-10 rounded-3xl shadow-2xl flex flex-col items-center">
          
          {/* Logo Badge & Title Inline (Premium SaaS Style) */}
          <div className="flex items-center gap-3.5 mb-10 select-none">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-indigo-600/20 relative overflow-hidden group shrink-0 border border-indigo-500/30">
              <span className="relative z-10 font-sans">D</span>
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500 to-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </div>
            <div className="flex flex-col items-start justify-center">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-none font-sans">DymTask</h1>
              <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mt-1.5 leading-none">事務代行</span>
            </div>
          </div>

          {/* Dynamic Whitelist/Access Warning Messages */}
          {errorMsg && (
            <div className="w-full mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs flex items-start gap-3 justify-start text-left shrink-0 animate-shake">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-rose-300">Access Denied</p>
                <p className="leading-relaxed opacity-90">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Core Actions Box */}
          <div className="w-full space-y-6">
            
            {/* Standard Google Sign In */}
            <div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full relative flex items-center justify-center gap-3 bg-white text-slate-900 py-3.5 px-6 rounded-2xl font-bold text-slate-800 text-xs hover:bg-slate-50 transition-all hover:shadow-[0_0_20px_rgba(255,255,255,0.15)] active:scale-[0.98] cursor-pointer"
              >
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Sign in with Google (Live Auth)</span>
              </button>
            </div>
          </div>

          {/* Secure Branding Footer */}
          <footer className="mt-8 pt-8 border-t border-white/5 w-full flex flex-col items-center">
            <span className="text-[10px] text-slate-600 font-bold tracking-wider uppercase mb-3">Secured Identity System</span>
            <div className="flex items-center gap-2 grayscale brightness-75 opacity-40">
              <img src="https://supabase.com/dashboard/img/supabase-logo.svg" className="h-4.5" alt="Supabase" />
              <span className="text-white font-extrabold text-[11px]">Supabase Auth</span>
            </div>
          </footer>
        </div>
        
        <div className="mt-6 text-center">
          <p className="text-slate-600 text-xs font-bold font-sans">
            &copy; 2026 DYM Vietnam. All rights reserved.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
