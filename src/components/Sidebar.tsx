import React from 'react';
import { motion } from 'motion/react';
import { useAppStore, AppState } from '../types';
import { useAuthStore } from '../store/authStore';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { 
  ClipboardList, 
  Settings as SettingsIcon, 
  LayoutDashboard, 
  History, 
  User as UserIcon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  CheckSquare
} from 'lucide-react';

const parseTaskDescription = (rawDescription: any) => {
  const defaultMeta = {
    team_name: '',
    sub_tasks: [] as any[]
  };

  if (!rawDescription) return defaultMeta;

  if (typeof rawDescription === 'object') {
    return {
      team_name: rawDescription.team_name || '',
      sub_tasks: Array.isArray(rawDescription.sub_tasks) ? rawDescription.sub_tasks : []
    };
  }

  if (typeof rawDescription === 'string') {
    const trimmed = rawDescription.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return {
          team_name: parsed.team_name || '',
          sub_tasks: Array.isArray(parsed.sub_tasks) ? parsed.sub_tasks : []
        };
      } catch {
        // Fallback
      }
    }
  }

  return defaultMeta;
};

const Sidebar = () => {
  const { activeTab, setActiveTab, theme, setTheme, isSidebarOpen, setSidebarOpen, usersFullList, fetchMetadata, approveTasks, fetchApproveTasks } = useAppStore();
  const { profile, signOut } = useAuthStore();
  const currentUser = profile;

  React.useEffect(() => {
    fetchMetadata();
    fetchApproveTasks();
  }, [fetchMetadata, fetchApproveTasks]);

  const counts = React.useMemo(() => {
    const userRole = (profile?.role || 'user').toString().toLowerCase().trim();
    const isUser = userRole === 'user';
    const isMasterOrAdmin = userRole === 'master' || userRole === 'admin';
    const defaultAssignee = isUser ? (profile?.name || '') : '';
    const defaultTeams = (isMasterOrAdmin && profile?.team_ids && profile.team_ids.length > 0)
      ? profile.team_ids
      : (profile?.team_ids?.[0] ? [profile.team_ids[0]] : []);

    let matchedTasks = approveTasks.map(req => {
      const meta = parseTaskDescription(req.description);
      const matchedUser = usersFullList?.find((u: any) => u.id === req.user_id);
      return {
        ...req,
        team_name: meta.team_name,
        sub_tasks: meta.sub_tasks,
        creator_name: matchedUser?.name || 'User Request'
      };
    });

    // Default filters
    if (defaultAssignee) {
      matchedTasks = matchedTasks.filter(r => 
        r.creator_name === defaultAssignee ||
        r.sub_tasks.some((s: any) => s.assignee === defaultAssignee)
      );
    }

    if (defaultTeams.length > 0) {
      matchedTasks = matchedTasks.filter(r => defaultTeams.includes(r.team_name));
    }

    const pendingCount = matchedTasks.filter(r => r.status === 'PENDING').length;
    const rejectedCount = matchedTasks.filter(r => r.status === 'REJECTED').length;

    return { pending: pendingCount, rejected: rejectedCount };
  }, [approveTasks, profile, usersFullList]);

  const menuItems: { id: AppState['activeTab']; icon: any; roles: string[]; label: string }[] = [
    { id: 'TO-DO LIST', icon: ClipboardList, roles: ['master', 'admin', 'user'], label: 'To-do list' },
    { id: 'TASK MANAGER', icon: ClipboardList, roles: ['master', 'admin', 'user'], label: 'Task manager' },
    { id: 'APPROVE TASK', icon: CheckSquare, roles: ['master', 'admin', 'user'], label: 'Approve Task' },
    { id: 'DASHBOARD', icon: LayoutDashboard, roles: ['master', 'admin', 'user'], label: 'Dashboard' },
    { id: 'AUDIT LOG', icon: History, roles: ['master', 'admin', 'user'], label: 'Audit log' },
    { id: 'SETTINGS', icon: SettingsIcon, roles: ['master', 'admin'], label: 'Settings' },
  ];

  const filteredMenuItems = menuItems.filter(item => {
    const role = (profile?.role || 'user').toString().toLowerCase().trim();
    return item.roles.includes(role);
  });



  return (
    <>
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/60 z-40 transition-opacity animate-in fade-in duration-200" 
          onClick={() => setSidebarOpen(false)} 
        />
      )}
      
      <div className={cn(
        "fixed md:relative inset-y-0 left-0 z-50 flex h-full shrink-0 transition-all duration-300",
        isSidebarOpen ? "w-64" : "w-0"
      )}>
        <aside className={cn(
          "bg-slate-900 border-r text-slate-300 flex flex-col h-full shrink-0 fixed md:static inset-y-0 left-0 transition-all duration-300 shadow-xl md:shadow-none overflow-hidden",
          isSidebarOpen 
            ? "w-64 translate-x-0 border-slate-800" 
            : "w-0 -translate-x-full md:translate-x-0 md:w-0 border-transparent"
        )}>
          <div className="w-64 flex flex-col h-full shrink-0">
          <div className="p-5 flex items-center gap-3.5 px-4.5 border-b border-slate-800/60 select-none">
        <div className="w-8.5 h-8.5 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-xl flex items-center justify-center text-white font-extrabold text-[15px] shrink-0 shadow-md shadow-indigo-600/20">
          D
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-base text-slate-50 tracking-tight leading-tight hover:text-indigo-400 transition-colors cursor-default">DymTask</span>
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">事務代行</span>
        </div>
      </div>

      <nav className="flex-1 px-3.5 mt-5 space-y-1">
        {filteredMenuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 ease-out group cursor-pointer relative",
              activeTab === item.id 
                ? "text-white font-semibold" 
                : "hover:bg-slate-800/60 hover:text-slate-105 text-slate-400"
            )}
          >
            {activeTab === item.id && (
              <motion.div
                layoutId="activeSidebarTab"
                className="absolute inset-0 bg-indigo-600 rounded-xl shadow-md shadow-indigo-600/15 border border-indigo-500/10"
                transition={{ type: "spring", stiffness: 350, damping: 32 }}
              />
            )}
            <item.icon className={cn("w-[18px] h-[18px] shrink-0 transition-transform duration-200 group-hover:scale-105 relative z-10", activeTab === item.id ? "text-white" : "text-slate-500 group-hover:text-slate-300")} />
            <span className="tracking-wide relative z-10 truncate whitespace-nowrap">{item.label}</span>
            <div className="ml-auto flex items-center gap-1 relative z-10 shrink-0">
              {item.id === 'APPROVE TASK' && (counts.pending > 0 || counts.rejected > 0) && (
                <div className="flex flex-col gap-0.5 justify-center items-center select-none shrink-0 leading-none mr-0.5">
                  {counts.pending > 0 && (
                    <span 
                      className="h-3 min-w-[12px] px-0.5 flex items-center justify-center rounded-sm text-[8px] font-extrabold bg-amber-500 text-slate-950 font-mono shadow-sm"
                      title={`${counts.pending} Pending requests`}
                    >
                      {counts.pending}
                    </span>
                  )}
                  {counts.rejected > 0 && (
                    <span 
                      className="h-3 min-w-[12px] px-0.5 flex items-center justify-center rounded-sm text-[8px] font-extrabold bg-rose-600 text-white font-mono shadow-sm"
                      title={`${counts.rejected} Rejected requests`}
                    >
                      {counts.rejected}
                    </span>
                  )}
                </div>
              )}
              {activeTab === item.id && (
                <ChevronRight className="w-3.5 h-3.5 opacity-75 animate-pulse shrink-0" />
              )}
            </div>
          </button>
        ))}
      </nav>

      <div className="p-4 mt-auto space-y-4">
        <div className="bg-slate-950/20 rounded-xl p-3.5 border border-slate-800/80">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 px-0.5">Theme</p>
          <div className="flex bg-slate-950/40 p-1 rounded-xl border border-slate-800/60 font-sans">
            <button
              onClick={() => setTheme('light')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer",
                theme === 'light' 
                  ? "bg-indigo-600 text-white shadow-sm" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Sun size={13} />
              <span>Light</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer",
                theme === 'dark' 
                  ? "bg-indigo-600 text-white shadow-sm" 
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              <Moon size={13} />
              <span>Dark</span>
            </button>
          </div>
        </div>

        <div className="bg-slate-950/40 border border-slate-800/95 rounded-2xl p-4 space-y-4 font-sans shadow-inner">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold shrink-0 text-sm shadow-md">
              {profile?.name?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-slate-200 leading-snug truncate" title={profile?.name || 'Loading...'}>
                {profile?.name || 'Loading...'}
              </p>
              <p className="text-[11px] text-slate-500 truncate mt-0.5" title={profile?.email || 'N/A'}>
                {profile?.email || 'N/A'}
              </p>
            </div>
          </div>

          {/* Details - Role & Team */}
          <div className="flex items-center justify-between gap-2.5 pt-0.5">
            <span className={cn(
              "px-2 py-0.5 rounded-lg border text-[9px] font-bold uppercase shrink-0 tracking-wide",
              (profile?.role || 'user').toString().toLowerCase().trim() === 'master' 
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
                : (profile?.role || 'user').toString().toLowerCase().trim() === 'admin' 
                  ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' 
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            )}>
              {profile?.role || 'user'}
            </span>

            <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-350 font-bold text-[10px] border border-slate-700/60 truncate max-w-[124px]" title={currentUser?.team_ids?.[0] || 'No Team'}>
              {currentUser?.team_ids?.[0] || 'No Team'}
            </span>
          </div>

          {/* Nút Đăng xuất */}
          <div className="pt-3 border-t border-slate-800/80">
            <button 
              onClick={() => signOut()}
              className="w-full flex items-center gap-2.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 py-2.5 px-3 rounded-xl transition-all duration-200 text-xs font-semibold text-left cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
    </aside>

    {/* Floating Border Toggle Handle (Desktop only) */}
    <button
      type="button"
      onClick={() => setSidebarOpen(!isSidebarOpen)}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2 z-50",
        "w-5 h-10 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/80 text-slate-400 hover:text-indigo-400 rounded-md flex items-center justify-center cursor-pointer shadow-md select-none transition-all duration-250 hover:scale-105 active:scale-95 group",
        "hidden md:flex"
      )}
      title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
    >
      {isSidebarOpen ? (
        <ChevronLeft size={13} className="transition-transform duration-205 group-hover:-translate-x-0.5" />
      ) : (
        <ChevronRight size={13} className="transition-transform duration-205 group-hover:translate-x-0.5" />
      )}
    </button>
  </div>
    </>
  );
};

export default Sidebar;
