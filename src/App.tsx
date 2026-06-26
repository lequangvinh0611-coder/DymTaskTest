import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from './types';
import { useAuthStore } from './store/authStore';
import { supabase } from './lib/supabase';
import Sidebar from './components/Sidebar';
import TaskList from './components/TaskList';
import AuditLog from './components/AuditLog';
import Settings from './components/Settings';
import Dashboard from './components/Dashboard';
import Login from './components/auth/Login';
import TaskManager from './pages/TaskManager';
import ApproveTask from './pages/ApproveTask';
import UserGuideModal from './components/UserGuideModal';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Toaster, toast } from 'sonner';
import { Menu, Loader2, HelpCircle } from 'lucide-react';

import { cn } from './lib/utils';

export default function App() {
  const { activeTab, theme, confirmDialog, hideConfirm, fetchMetadata, fetchTasks, fetchApproveTasks, isSidebarOpen, setSidebarOpen } = useAppStore();
  const { session, profile, loading, initializeAuth } = useAuthStore();

  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const channelRef = useRef<any>(null);

  useEffect(() => {
    initializeAuth();
  }, []);

  useEffect(() => {
    if (session && profile) {
      // Helper to debounce callbacks for Postgres changes to prevent redundant rapid fetch storms
      const debounce = (func: (...args: any[]) => void, wait: number) => {
        let timeout: any;
        return (...args: any[]) => {
          clearTimeout(timeout);
          timeout = setTimeout(() => {
            func(...args);
          }, wait);
        };
      };

      const debouncedFetchDailyOnly = debounce(() => {
        const state = useAppStore.getState();
        if (state.startDate) {
          state.fetchDailyTasks(state.startDate, state.endDate, true);
        }
      }, 300);

      const debouncedFetchTemplatesAndDaily = debounce(() => {
        const state = useAppStore.getState();
        state.fetchTasks(true);
        if (state.startDate) {
          state.fetchDailyTasks(state.startDate, state.endDate, true);
        }
      }, 300);

      const debouncedFetchMetadata = debounce(() => {
        useAppStore.getState().fetchMetadata(true);
      }, 300);

      const debouncedFetchApproveTasks = debounce(() => {
        useAppStore.getState().fetchApproveTasks(true);
      }, 300);

      // Hàm đăng ký realtime đồng bộ dữ liệu toàn cục
      const subscribeRealtime = () => {
        if (channelRef.current) return;

        const channel = supabase.channel('global_app_realtime_sync')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
            debouncedFetchTemplatesAndDaily();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks' }, () => {
            debouncedFetchTemplatesAndDaily();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'task_logs' }, (payload: any) => {
            const state = useAppStore.getState();
            const targetDate = payload.new?.todo_date || payload.old?.todo_date;
            if (targetDate && state.startDate && state.endDate) {
              if (targetDate >= state.startDate && targetDate <= state.endDate) {
                debouncedFetchDailyOnly();
              }
            } else {
              debouncedFetchDailyOnly();
            }
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'subtask_logs' }, (payload: any) => {
            const state = useAppStore.getState();
            const targetDate = payload.new?.todo_date || payload.old?.todo_date;
            if (targetDate && state.startDate && state.endDate) {
              if (targetDate >= state.startDate && targetDate <= state.endDate) {
                debouncedFetchDailyOnly();
              }
            } else {
              debouncedFetchDailyOnly();
            }
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
            debouncedFetchMetadata();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
            debouncedFetchMetadata();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
            debouncedFetchMetadata();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'tags' }, () => {
            debouncedFetchMetadata();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'approve_tasks' }, () => {
            debouncedFetchApproveTasks();
          })
          .subscribe();

        channelRef.current = channel;
      };

      // Hàm ẩn kênh/ngắt kết nối toàn cục
      const unsubscribeRealtime = () => {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current).catch(err => {
            console.warn('[App] Realtime unsubscribe error:', err);
          });
          channelRef.current = null;
        }
      };

      // Lần đầu tải trang
      fetchMetadata();
      fetchTasks();
      fetchApproveTasks();
      subscribeRealtime();

      // Theo dõi trạng thái hiển thị của tab trình duyệt
      const handleVisibilityChange = async () => {
        if (!document.hidden) {
          // Gọi syncDeltaUpdates để đồng bộ delta dữ liệu khi quay lại tab
          const success = await useAppStore.getState().syncDeltaUpdates();

          if (success) {
            // Subtle toast message for professional, polished feedback
            toast.success('System data synchronized successfully!', {
              id: 'realtime-tab-refresh',
              duration: 2000,
            });
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        unsubscribeRealtime();
      };
    }
  }, [session, profile]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Make useAppStore globally accessible for our ProtectedRoute redirect backup action
  useEffect(() => {
    (window as any).useAppStore = useAppStore;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 select-none font-sans">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-900 rounded-full blur-[120px]"></div>
        </div>
        <div className="relative z-10 flex flex-col items-center">
          <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
          <h1 className="text-white font-bold text-sm tracking-widest uppercase animate-pulse">DYMTASK MVP</h1>
          <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase">Syncing secure session...</p>
        </div>
      </div>
    );
  }

  if (!session || !profile) {
    return (
      <>
        <Toaster 
          richColors 
          position="top-center" 
          theme="light" 
          duration={1000}
          style={{ top: '6px' }}
          toastOptions={{
            className: 'border border-slate-200/80 shadow-sm rounded-full py-0.5 px-2.5 min-h-0 text-[10px] sm:text-[11px] font-semibold flex items-center justify-center bg-white max-w-[280px]',
            style: {
              top: '0px',
              padding: '2px 8px',
              minHeight: '24px',
              alignItems: 'center',
            }
          }}
        />
        <Login />
      </>
    );
  }

  const userRole = (profile?.role || 'master').toString().toUpperCase().trim();
  const normalizedActiveTab = activeTab.toString().toUpperCase().trim();

  return (
    <div className="h-screen w-full flex bg-slate-50 overflow-hidden font-sans">
      <Toaster 
        richColors 
        position="top-center" 
        theme="light" 
        duration={1000}
        style={{ top: '6px' }}
        toastOptions={{
          className: 'border border-slate-200/80 shadow-sm rounded-full py-0.5 px-2.5 min-h-0 text-[10px] sm:text-[11px] font-semibold flex items-center justify-center bg-white max-w-[280px]',
          style: {
            top: '0px',
            padding: '2px 8px',
            minHeight: '20px',
            alignItems: 'center',
          }
        }}
      />
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-full p-2 bg-slate-50/50">
        <header className="h-[26px] flex items-center justify-between mb-1.5 shrink-0 px-3 mt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen(!isSidebarOpen)}
              className="md:hidden p-1 mr-1 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-slate-200/60 focus:outline-none transition-colors cursor-pointer"
              aria-label="Toggle Sidebar"
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              <Menu size={16} className={cn("transition-transform duration-200", !isSidebarOpen && "rotate-90")} />
            </button>
            <h1 
              className="text-xs uppercase tracking-wider font-bold text-slate-800 cursor-pointer hover:text-indigo-600 transition-all font-sans"
              onClick={() => useAppStore.getState().triggerRefresh()}
              title="Click to refresh data"
            >
              {activeTab}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsGuideOpen(true)}
              className="flex items-center gap-1 px-2 h-6 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-150 rounded text-[10px] font-bold text-indigo-600 hover:text-indigo-700 transition-all shadow-sm cursor-pointer select-none"
            >
              <HelpCircle size={11} className="text-indigo-500 animate-pulse shrink-0" />
              <span>User Guide</span>
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 relative">
          {/* TO-DO LIST Tab */}
          <div className={cn("w-full h-full flex flex-col min-h-0 absolute inset-0 transition-opacity duration-150", normalizedActiveTab === 'TO-DO LIST' ? "opacity-100 z-10 pointer-events-auto" : "opacity-0 z-0 pointer-events-none")}>
            <TaskList key="todo" title="To-do List" />
          </div>

          {/* TASK MANAGER Tab */}
          <div className={cn("w-full h-full flex flex-col min-h-0 absolute inset-0 transition-opacity duration-150", normalizedActiveTab === 'TASK MANAGER' ? "opacity-100 z-10 pointer-events-auto" : "opacity-0 z-0 pointer-events-none")}>
            <TaskManager key="manager" />
          </div>

          {/* DASHBOARD Tab */}
          <div className={cn("w-full h-full flex flex-col min-h-0 absolute inset-0 transition-opacity duration-150", normalizedActiveTab === 'DASHBOARD' ? "opacity-100 z-10 pointer-events-auto" : "opacity-0 z-0 pointer-events-none")}>
            <Dashboard key="dashboard" />
          </div>

          {/* APPROVE TASK Tab */}
          <div className={cn("w-full h-full flex flex-col min-h-0 absolute inset-0 transition-opacity duration-150", normalizedActiveTab === 'APPROVE TASK' ? "opacity-100 z-10 pointer-events-auto" : "opacity-0 z-0 pointer-events-none")}>
            <ApproveTask key="approve" />
          </div>

          {/* AUDIT LOG Tab */}
          <div className={cn("w-full h-full flex flex-col min-h-0 absolute inset-0 transition-opacity duration-150", normalizedActiveTab === 'AUDIT LOG' ? "opacity-100 z-10 pointer-events-auto" : "opacity-0 z-0 pointer-events-none")}>
            <ProtectedRoute allowedRoles={['master', 'admin', 'user']}>
              <AuditLog key="audit" />
            </ProtectedRoute>
          </div>

          {/* SETTINGS Tab */}
          <div className={cn("w-full h-full flex flex-col min-h-0 absolute inset-0 transition-opacity duration-150", normalizedActiveTab === 'SETTINGS' ? "opacity-100 z-10 pointer-events-auto" : "opacity-0 z-0 pointer-events-none")}>
            <ProtectedRoute allowedRoles={['master', 'admin']}>
              <Settings key="settings" />
            </ProtectedRoute>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {confirmDialog && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={hideConfirm}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.25 }}
              className="bg-white border border-slate-100 rounded-xl shadow-2xl p-5 max-w-sm w-full relative z-10 select-none text-left"
            >
              <h3 className="text-sm font-semibold text-slate-800 mb-1.5">{confirmDialog.title}</h3>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">{confirmDialog.message}</p>
              <div className="flex items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    if (confirmDialog.onCancel) confirmDialog.onCancel();
                    hideConfirm();
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-semibold cursor-pointer transition-colors"
                >
                  {confirmDialog.cancelText || 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmDialog.onConfirm();
                    hideConfirm();
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold cursor-pointer transition-colors"
                >
                  {confirmDialog.confirmText || 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <UserGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  );
}
