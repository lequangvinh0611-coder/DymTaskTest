import React, { useEffect, useState } from 'react';
import { Search, Trash2, Info, ChevronRight, Loader2, History, AlertCircle, RotateCw, RotateCcw, ChevronLeft, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../types';
import { AuditLog as AuditLogType } from '../types/database.types';
import { DateRangePicker } from './ui/DateRangePicker';
import { toast } from 'sonner';
import { useAuthStore } from '../store/authStore';

const AuditLog = () => {
  const { refreshKey, showConfirm } = useAppStore();
  const { profile } = useAuthStore();
  
  const userRole = (profile?.role || 'user').toString().toLowerCase().trim();
  const isAdminOrMaster = userRole === 'master' || userRole === 'admin';
  const [logs, setLogs] = useState<AuditLogType[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const today = new Date().toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState({
    startDate: today,
    endDate: today
  });

  const isFilterChanged = searchTerm !== '' || dateRange.startDate !== today || dateRange.endDate !== today;

  const handleReset = () => {
    setSearchTerm('');
    setDateRange({ startDate: today, endDate: today });
    setPage(1);
  };
  const pageSize = 15;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' });

      if (searchTerm) {
        query = query.or(`action.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
      }

      if (dateRange.startDate) {
        query = query.gte('created_at', `${dateRange.startDate}T00:00:00`);
      }
      if (dateRange.endDate) {
        query = query.lte('created_at', `${dateRange.endDate}T23:59:59`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [searchTerm, page, dateRange, refreshKey]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const getPaginationItems = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (page <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (page >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        pages.push(page - 1);
        pages.push(page);
        pages.push(page + 1);
        pages.push('...');
        pages.push(totalPages);
      }
    }
    return pages;
  };

  const getActionColor = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('CREATE')) return 'bg-emerald-50 text-emerald-600 border-emerald-100';
    if (act.includes('UPDATE')) return 'bg-primary-light text-primary border-primary/20';
    if (act.includes('DELETE') || act.includes('REMOVE')) return 'bg-rose-50 text-rose-600 border-rose-100';
    if (act.includes('RESET')) return 'bg-amber-50 text-amber-600 border-amber-100';
    return 'bg-slate-50 text-slate-500 border-slate-200';
  }

  const handleDeleteLog = async (id: string) => {
    showConfirm({
      title: "Confirm Log Deletion",
      message: "Are you sure you want to delete this activity log record?",
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        const { error } = await supabase.from('audit_logs').delete().eq('id', id);
        if (!error) {
          toast.success("Activity log deleted successfully!");
          fetchLogs();
        } else {
          toast.error(`Error deleting log: ${error.message}`);
        }
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white shadow-sm overflow-x-auto">
      {/* Header Bar */}
      <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex items-center justify-between gap-4 flex-nowrap overflow-visible relative z-[40] min-w-max w-full">
        <div className="flex items-center gap-1.5 shrink-0 flex-nowrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by anything..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs w-48 focus:outline-none focus:border-slate-400 font-medium text-slate-700 h-8 shadow-sm"
            />
          </div>
          <DateRangePicker 
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={(start, end) => {
              setDateRange({ startDate: start, endDate: end });
              setPage(1);
            }}
          />
          {isFilterChanged && (
            <button 
              onClick={handleReset} 
              className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
              title="Reset filters"
            >
               <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white min-h-[500px]">
        <table className="w-full text-left border-collapse table-fixed min-w-[1100px]">
          <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-20">
            <tr className="h-8">
              <th className="px-6 py-2 w-[15%] text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Action</th>
              <th className="px-6 py-2 w-[35%] text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Description</th>
              <th className="px-6 py-2 w-[20%] text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">User</th>
              <th className="px-6 py-2 w-[15%] text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Time</th>
              <th className="px-6 py-2 w-[10%] text-[11px] uppercase tracking-wider font-bold text-slate-500 text-right pr-6 bg-slate-100">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y premium-divide">
            {logs.length > 0 ? (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 transition-all h-[46px]">
                  <td className="px-6 py-1.5 overflow-hidden">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-medium rounded-full",
                    )}>
                      {/* Dot style action indicators */}
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        log.action.toUpperCase().includes('CREATE') ? "bg-emerald-500" :
                        log.action.toUpperCase().includes('UPDATE') ? "bg-blue-500" :
                        log.action.toUpperCase().includes('DELETE') ? "bg-rose-500" : "bg-slate-400"
                      )} />
                      <span className="text-slate-600 text-xs">
                        {log.action}
                      </span>
                    </span>
                  </td>
                  <td className="px-6 py-1.5 overflow-hidden">
                    <p className="text-slate-700 text-xs truncate font-medium" title={log.description}>{log.description}</p>
                  </td>
                  <td className="px-6 py-1.5 overflow-hidden">
                     <span className="text-xs font-medium text-slate-500">{log.user_name || 'System Auto'}</span>
                  </td>
                  <td className="px-6 py-1.5 overflow-hidden">
                       <span className="text-xs text-slate-400 font-mono">
                         {(() => { const d = new Date(log.created_at); if (isNaN(d.getTime())) return ''; const day = String(d.getDate()).padStart(2, '0'); const month = String(d.getMonth() + 1).padStart(2, '0'); const year = d.getFullYear(); return `${day}/${month}/${year}`; })()} - {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                       </span>
                  </td>
                  <td className="px-6 py-1.5 text-right pr-6">
                    <div className="flex items-center justify-end gap-2">
                       <button className="text-slate-300 hover:text-indigo-600 transition-all cursor-pointer">
                        <Info size={14} />
                      </button>
                      {isAdminOrMaster && (
                        <button 
                          onClick={() => handleDeleteLog(log.id)}
                          className="text-slate-300 hover:text-rose-600 transition-all cursor-pointer"
                          title="Delete Activity Log"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-24 text-center">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="p-4 bg-slate-50 rounded-full mb-3 text-slate-300 inline-block mx-auto">
                      <AlertCircle size={36} />
                    </div>
                    <h4 className="text-slate-800 font-bold text-sm">No Audit Logs Available</h4>
                    <p className="text-slate-400 text-xs mt-1 max-w-xs leading-relaxed mx-auto">
                      No activity log records found matching your filters.
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="px-6 py-3 border-t border-slate-100 bg-white flex items-center justify-between shrink-0 selection:bg-none">
         <span className="text-xs font-medium text-slate-400 font-mono min-w-[100px]">Total logs: {totalCount}</span>
         <div className="flex-1 flex items-center justify-center gap-1.5">
            <button 
              disabled={page === 1} 
              onClick={() => setPage(p => p - 1)} 
              className="px-2.5 py-1.5 text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="flex gap-1.5 mx-2">
              {getPaginationItems().map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => typeof item === 'number' && setPage(item)}
                  disabled={typeof item !== 'number'}
                  className={cn(
                    "w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all select-none",
                    page === item 
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-100 cursor-default" 
                      : typeof item === 'number'
                        ? "text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-slate-200/60 bg-white cursor-pointer"
                        : "text-slate-300 cursor-default"
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
            <button 
              disabled={page === totalPages} 
              onClick={() => setPage(p => p + 1)} 
              className="px-2.5 py-1.5 text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
         </div>
         <div className="min-w-[100px]"></div>
      </div>
    </div>
  );
};

export default AuditLog;
