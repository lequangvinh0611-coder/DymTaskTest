import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, RotateCcw, Clock, Check, AlertCircle, ChevronLeft, ChevronRight, 
  X, Calendar, Download, RefreshCw, Layers, CheckSquare, Square, Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DateRangePicker } from './ui/DateRangePicker';
import { FilterSelect } from './ui/FilterSelect';
import { SearchableFilterSelect } from './ui/SearchableFilterSelect';
import { MultiTeamFilterSelect } from './ui/MultiTeamFilterSelect';
import { toast } from 'sonner';
import { useAppStore } from '../types';
import { useAuthStore } from '../store/authStore';
import { logger } from '../lib/logger';
import { getTaskTeams as getTaskTeamsShared } from '../lib/utils';

// TS interfaces matching the schema
interface SubTask {
  id: string;
  content: string;
  assignee: string;
  est_time: number;
  actual_time?: number; // Realized minutes tracked for To-do
  sub_status?: 'New' | 'Done' | 'Skipped'; // Status of individual sub-task
  last_updated_by?: string;
  last_updated_at?: string;
}

interface TaskVersion {
  valid_from: string;
  valid_until?: string | null;
  title: string;
  description: string;
  project_name: string;
  team_name: string;
  tag_name: string;
  deadline_time: string;
  deadline_days: string;
  est_time: number;
  sub_tasks: SubTask[];
}

interface TaskMetadata {
  project_name: string;
  team_name: string;
  tag_name: string;
  note: string;
}

interface DbTask {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  status: string; // 'ON' / 'OFF' template setting
  is_active: boolean;
  est_time: number;
  actual_time: number;
  created_at: string;
  assignees?: string[];
  display_id?: number | null;
  deadline_days?: string | null;
  deadline_time?: string | null;
}

interface VirtualTask extends DbTask {
  virtual_id: string;
  meta: TaskMetadata;
  project_name?: string;
  team_name?: string;
  tag_name?: string;
  todo_date: string;
  todo_status: string;
  sub_tasks: any[];
  origin_repeat_day?: number;
  completion_key?: string;
}

const getVirtualOccurrences = (
  task_type: string,
  deadline_days: string,
  createdAt: string,
  startDate: string,
  endDate: string
): Array<{ todo_date: string; origin_repeat_day?: number; completion_key: string }> => {
  const type = (task_type || '').toUpperCase();
  let cleanDays = (deadline_days || '').trim();

  if (cleanDays.startsWith('[') && cleanDays.endsWith(']')) {
    try {
      const parsed = JSON.parse(cleanDays);
      if (Array.isArray(parsed)) {
        cleanDays = parsed.join(', ').trim();
      }
    } catch (e) {
      // ignore
    }
  }

  const occurrences: Array<{ todo_date: string; origin_repeat_day?: number; completion_key: string }> = [];

  const parseDateStringUTC = (str: string): Date => {
    const parts = str.split('-');
    return new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
  };

  const formatDateUTC = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const startD = parseDateStringUTC(startDate);
  const endD = parseDateStringUTC(endDate);

  if (type === 'ONETIME') {
    const datesParsed: string[] = [];
    if (cleanDays.includes('~')) {
      const parts = cleanDays.split('~').map(s => s.trim());
      const startStr = parts[0];
      const endStr = parts[1];
      if (/^\d{4}-\d{2}-\d{2}$/.test(startStr) && /^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
        let curr = parseDateStringUTC(startStr);
        const last = parseDateStringUTC(endStr);
        while (curr <= last) {
          datesParsed.push(formatDateUTC(curr));
          curr.setUTCDate(curr.getUTCDate() + 1);
        }
      }
    } else if (cleanDays.includes(',')) {
      cleanDays.split(',').forEach(s => {
        const dStr = s.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
          datesParsed.push(dStr);
        }
      });
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDays)) {
      datesParsed.push(cleanDays);
    }

    datesParsed.forEach(dateStr => {
      if (dateStr >= startDate && dateStr <= endDate) {
        occurrences.push({
          todo_date: dateStr,
          completion_key: dateStr
        });
      }
    });

    return occurrences;
  }

  const createdAtDate = createdAt ? createdAt.split('T')[0] : '';

  if (type === 'DAILY' || type === 'WEEKLY') {
    let curr = new Date(startD);
    while (curr <= endD) {
      const dateStr = formatDateUTC(curr);
      if (!createdAtDate || dateStr >= createdAtDate) {
        const weekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayShort = weekdaysShort[curr.getUTCDay()];

        let isMatch = false;
        if (type === 'DAILY') {
          isMatch = dayShort !== 'Sun' && dayShort !== 'Sat';
        } else if (type === 'WEEKLY') {
          if (cleanDays === 'Mon - Fri' || cleanDays === 'Daily') {
            isMatch = dayShort !== 'Sun' && dayShort !== 'Sat';
          } else {
            const parts = cleanDays.split(/[\s,]+/).map(d => d.trim().toLowerCase());
            isMatch = parts.includes(dayShort.toLowerCase());
          }
        }

        if (isMatch) {
          occurrences.push({
            todo_date: dateStr,
            completion_key: dateStr
          });
        }
      }
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return occurrences;
  }

  if (type === 'MONTHLY') {
    const parts = cleanDays.split(/[\s,]+/).map(p => parseInt(p.trim())).filter(p => !isNaN(p));
    
    const expStart = new Date(startD);
    expStart.setUTCDate(expStart.getUTCDate() - 3);
    const expEnd = new Date(endD);
    expEnd.setUTCDate(expEnd.getUTCDate() + 3);

    let curr = new Date(expStart);
    while (curr <= expEnd) {
      const curYear = curr.getUTCFullYear();
      const curMonth = curr.getUTCMonth();
      const curDate = curr.getUTCDate();
      
      const lastDayOfMonth = new Date(Date.UTC(curYear, curMonth + 1, 0)).getUTCDate();
      
      const weekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayShort = weekdaysShort[curr.getUTCDay()];

      const matchingR = parts.find(r => Math.min(r, lastDayOfMonth) === curDate);
      
      if (matchingR !== undefined) {
        let shiftD = new Date(curr);

        if (dayShort === 'Sat') {
          shiftD.setUTCDate(curr.getUTCDate() - 1);
        } else if (dayShort === 'Sun') {
          shiftD.setUTCDate(curr.getUTCDate() + 1);
        }

        const shiftedDateStr = formatDateUTC(shiftD);
        
        if (shiftedDateStr >= startDate && shiftedDateStr <= endDate) {
          if (!createdAtDate || shiftedDateStr >= createdAtDate) {
            occurrences.push({
              todo_date: shiftedDateStr,
              origin_repeat_day: matchingR,
              completion_key: `${shiftedDateStr}_r${matchingR}`
            });
          }
        }
      }
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    
    occurrences.sort((a, b) => {
      if (a.todo_date !== b.todo_date) {
        return a.todo_date.localeCompare(b.todo_date);
      }
      return (a.origin_repeat_day || 0) - (b.origin_repeat_day || 0);
    });
    
    return occurrences;
  }

  return occurrences;
};

const isTaskOnDate = (task_type: string, deadlineDays: string, dateStr: string, createdAt: string): boolean => {
  const type = (task_type || '').toUpperCase();
  const cleanDays = (deadlineDays || '').trim();

  // Condition: không hiển thị những ngày trước thời điểm tạo task
  const createdAtDate = createdAt ? createdAt.split('T')[0] : '';
  if (createdAtDate && dateStr < createdAtDate) {
    return false;
  }

  const d = new Date(dateStr);
  const weekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayShort = weekdaysShort[d.getDay()];
  const dayOfMonth = d.getDate();

  if (type === 'DAILY') {
    return dayShort !== 'Sun' && dayShort !== 'Sat';
  }

  if (type === 'WEEKLY') {
    if (cleanDays === 'Mon - Fri' || cleanDays === 'Daily') {
      return dayShort !== 'Sun' && dayShort !== 'Sat';
    }
    const parts = cleanDays.split(/[\s,]+/).map(d => d.trim().toLowerCase());
    return parts.includes(dayShort.toLowerCase());
  }

  if (type === 'MONTHLY') {
    const parts = cleanDays.split(/[\s,]+/).map(d => parseInt(d.trim())).filter(d => !isNaN(d));
    const dayShortLower = dayShort.toLowerCase();
    
    if (dayShortLower === 'sat' || dayShortLower === 'sun') {
      return false;
    }
    
    if (dayShortLower === 'mon') {
      const yesterday = new Date(d);
      yesterday.setDate(d.getDate() - 1);
      const dayOfMonthYesterday = yesterday.getDate();
      return parts.includes(dayOfMonth) || parts.includes(dayOfMonthYesterday);
    }

    if (dayShortLower === 'fri') {
      const tomorrow = new Date(d);
      tomorrow.setDate(d.getDate() + 1);
      const dayOfMonthTomorrow = tomorrow.getDate();
      return parts.includes(dayOfMonth) || parts.includes(dayOfMonthTomorrow);
    }
    
    return parts.includes(dayOfMonth);
  }

  return false;
};

const getTaskVersionForDate = (task: any, date: string): TaskVersion | null => {
  const versions = task.meta?.versions || task.versions || [];
  for (const v of versions) {
    const from = v.valid_from;
    const until = v.valid_until;
    if (date >= from && (!until || date <= until)) {
      return v;
    }
  }
  return null;
};

const getDatesBetween = (start: string, end: string) => {
  const dates = [];
  let curr = new Date(start);
  const last = new Date(end);
  while (curr <= last) {
    dates.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
};

// Helper to convert UUID or DbTask to a secure, stable 6-digit number string
const getDisplayId = (idOrTask: string | { id: string; display_id?: number | null }): string => {
  if (!idOrTask) return '000001';
  if (typeof idOrTask === 'object') {
    if (idOrTask.display_id) {
      return String(idOrTask.display_id).padStart(6, '0');
    }
    return getDisplayId(idOrTask.id);
  }
  let hash = 0;
  for (let i = 0; i < idOrTask.length; i++) {
    hash = (hash << 5) - hash + idOrTask.charCodeAt(i);
    hash |= 0;
  }
  const positiveHash = Math.abs(hash) % 1000000;
  return String(positiveHash).padStart(6, '0');
};

const formatDisplayDate = (str?: any): string => {
  if (!str) return '';
  if (Array.isArray(str)) {
    if (str.length === 5 && ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].every(d => str.includes(d))) {
      return 'Mon - Fri';
    }
    const isAllDates = str.every(s => /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim()));
    if (isAllDates && str.length > 1) {
      const sorted = [...str].map(s => String(s).trim()).sort();
      const first = formatDisplayDate(sorted[0]);
      const last = formatDisplayDate(sorted[sorted.length - 1]);
      return first === last ? first : `${first} ~ ${last}`;
    }
    return str.map(s => formatDisplayDate(String(s).trim())).join(', ');
  }
  let trimmed = String(str).trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        return formatDisplayDate(arr);
      }
    } catch (e) {
      // safe fallback
    }
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const arr = trimmed.slice(1, -1).split(',').map(s => s.replace(/"/g, '').trim()).filter(Boolean);
    return formatDisplayDate(arr);
  }
  if (trimmed.includes('~')) {
    return trimmed.split('~').map(s => formatDisplayDate(s.trim())).join(' ~ ');
  }
  if (trimmed.includes(',')) {
    return trimmed.split(',').map(s => formatDisplayDate(s.trim())).join(', ');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = trimmed.split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return trimmed;
};

const formatDateTime = (isoString?: string) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
};

const parseTimeToMinutes = (timeStr: string): number => {
  if (!timeStr) return 9999;
  const cleaned = timeStr.trim().toUpperCase();
  const matchAmpm = cleaned.match(/^(\d+):(\d+)\s*(AM|PM)$/);
  if (matchAmpm) {
    let hour = parseInt(matchAmpm[1], 10);
    const min = parseInt(matchAmpm[2], 10);
    const period = matchAmpm[3];
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return hour * 60 + min;
  }
  const match24h = cleaned.match(/^(\d+):(\d+)$/);
  if (match24h) {
    const hour = parseInt(match24h[1], 10);
    const min = parseInt(match24h[2], 10);
    return hour * 60 + min;
  }
  return 9999;
};

const getTypeRank = (type: string): number => {
  const t = (type || '').toUpperCase();
  if (t === 'DAILY') return 1;
  if (t === 'WEEKLY') return 2;
  if (t === 'MONTHLY') return 3;
  if (t === 'ONETIME') return 4;
  return 99;
};

const parseTaskDescription = (rawDescription: any): TaskMetadata => {
  const defaultMeta: TaskMetadata = {
    project_name: '',
    team_name: '',
    tag_name: '',
    note: ''
  };

  if (!rawDescription) return defaultMeta;

  if (typeof rawDescription === 'object') {
    return {
      project_name: rawDescription.project_name || '',
      team_name: rawDescription.team_name || '',
      tag_name: rawDescription.tag_name || '',
      note: rawDescription.note || rawDescription.description || ''
    };
  }

  if (typeof rawDescription === 'string') {
    const trimmed = rawDescription.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return {
          project_name: parsed.project_name || '',
          team_name: parsed.team_name || '',
          tag_name: parsed.tag_name || '',
          note: parsed.note || parsed.description || ''
        };
      } catch {
        // Fallback
      }
    }
  }

  return {
    ...defaultMeta,
    note: String(rawDescription)
  };
};

const serializeTaskDescription = (metadata: TaskMetadata): any => {
  return metadata;
};

const getTodayDateString = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const checkAndToggleOnetimeTemplateStatus = async (taskId: string) => {
  const { data: task, error: fetchErr } = await supabase
    .from('tasks')
    .select(`
      id,
      task_type,
      deadline_days,
      task_logs:task_logs(todo_date, status)
    `)
    .eq('id', taskId)
    .single();

  if (fetchErr || !task) return;

  const type = (task.task_type || '').toUpperCase();
  if (type !== 'ONETIME') return;

  const cleanDays = (task.deadline_days || '').trim();
  const datesParsed: string[] = [];
  if (cleanDays.includes('~')) {
    const parts = cleanDays.split('~').map((s: string) => s.trim());
    const startStr = parts[0];
    const endStr = parts[1];
    if (/^\d{4}-\d{2}-\d{2}$/.test(startStr) && /^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
      const parseDateStringUTC = (str: string): Date => {
        const p = str.split('-');
        return new Date(Date.UTC(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])));
      };
      const formatDateUTC = (d: Date): string => {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      let curr = parseDateStringUTC(startStr);
      const last = parseDateStringUTC(endStr);
      while (curr <= last) {
        datesParsed.push(formatDateUTC(curr));
        curr.setUTCDate(curr.getUTCDate() + 1);
      }
    }
  } else if (cleanDays.includes(',')) {
    cleanDays.split(',').forEach((s: string) => {
      const dStr = s.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
        datesParsed.push(dStr);
      }
    });
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDays)) {
    datesParsed.push(cleanDays);
  }

  if (datesParsed.length === 0) return;

  const logs = task.task_logs || [];
  const allCompleted = datesParsed.every(date => {
    const log = logs.find((l: any) => l.todo_date === date);
    return log && (log.status === 'DONE' || log.status === 'SKIPPED');
  });

  const nextStatus = allCompleted ? 'OFF' : 'ON';
  const nextActive = !allCompleted;

  const { error: updateErr } = await supabase
    .from('tasks')
    .update({
      status: nextStatus,
      is_active: nextActive
    })
    .eq('id', taskId);

  if (!updateErr) {
    useAppStore.setState(state => {
      const nextDailyTasks = state.dailyTasks.map(t => {
        if (t.id === taskId) {
          return { ...t, status: nextStatus, is_active: nextActive };
        }
        return t;
      });
      return { dailyTasks: nextDailyTasks };
    });
  }
};

const TaskList: React.FC<{ title?: string }> = ({ title = "To-do List" }) => {
  const { currentUser, profile } = useAuthStore();
  const activeUser = currentUser || profile;
  const isUser = (activeUser?.role || '').toString().toLowerCase().trim() === 'user' || activeUser?.role === 'User';
  const { 
    showConfirm,
    dailyTasks,
    projectsList,
    teamsList,
    tagsList,
    assigneesList,
    usersFullList,
    dailyTasksLoaded,
    dailyTasksLoading,
    fetchDailyTasks,
    fetchMetadata,
    setDates
  } = useAppStore();
  const [localLoading, setLoading] = useState(false);
  
  // Loading state using global caching system to prevent blank flashes when switching tabs
  const loading = (!dailyTasksLoaded && dailyTasksLoading) || localLoading;

  // Filter conditions state matched to Mockup (with sessionStorage persistence)
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem('todo_searchQuery') || '');
  const [filterAssignee, setFilterAssignee] = useState(() => {
    const stored = sessionStorage.getItem('todo_filterAssignee');
    if (stored !== null) return stored;
    return useAuthStore.getState().profile?.name || '';
  });
  const [filterTag, setFilterTag] = useState(() => sessionStorage.getItem('todo_filterTag') || '');
  const [filterProject, setFilterProject] = useState(() => sessionStorage.getItem('todo_filterProject') || '');
  const [filterTeam, setFilterTeam] = useState(() => sessionStorage.getItem('todo_filterTeam') || '');

  const selectedTeams = useMemo(() => {
    return filterTeam ? filterTeam.split(',').filter(Boolean) : [];
  }, [filterTeam]);

  const [filterTodoStatus, setFilterTodoStatus] = useState(() => {
    const stored = sessionStorage.getItem('todo_filterTodoStatus');
    if (stored !== null) return stored;
    return 'NEW';
  });
  
  const [filterTaskType, setFilterTaskType] = useState(() => sessionStorage.getItem('todo_filterTaskType') || '');
  const selectedTaskTypes = useMemo(() => {
    return filterTaskType ? filterTaskType.split(',').filter(Boolean) : [];
  }, [filterTaskType]);
  
  // Date configuration
  const [startDate, setStartDate] = useState(() => sessionStorage.getItem('todo_startDate') || getTodayDateString());
  const [endDate, setEndDate] = useState(() => sessionStorage.getItem('todo_endDate') || getTodayDateString());

  useEffect(() => {
    sessionStorage.setItem('todo_searchQuery', searchQuery);
    sessionStorage.setItem('todo_filterAssignee', filterAssignee);
    sessionStorage.setItem('todo_filterTag', filterTag);
    sessionStorage.setItem('todo_filterProject', filterProject);
    sessionStorage.setItem('todo_filterTeam', filterTeam);
    sessionStorage.setItem('todo_filterTodoStatus', filterTodoStatus);
    sessionStorage.setItem('todo_filterTaskType', filterTaskType);
    sessionStorage.setItem('todo_startDate', startDate);
    sessionStorage.setItem('todo_endDate', endDate);
  }, [
    searchQuery,
    filterAssignee,
    filterTag,
    filterProject,
    filterTeam,
    filterTodoStatus,
    filterTaskType,
    startDate,
    endDate
  ]);

  // Pagination states
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Selected tasks (checkbox selection column)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [isQuickSkipMode, setIsQuickSkipMode] = useState(false);
  const [isQuickSubmitMode, setIsQuickSubmitMode] = useState(false);
  const [isAllPagesSelected, setIsAllPagesSelected] = useState(false);

  useEffect(() => {
    setSelectedTaskIds(new Set());
    setIsAllPagesSelected(false);
  }, [searchQuery, filterAssignee, filterTag, filterProject, filterTeam, filterTodoStatus, page]);

  // Drawer slider panel
  const [openedTask, setOpenedTask] = useState<VirtualTask | null>(null);
  const [drawerHasChanges, setDrawerHasChanges] = useState(false);

  // Initial tasks loader fetching active records using global app state
  const loadActiveTasks = async () => {
    await fetchDailyTasks(startDate, endDate);
  };

  // Build a map of usernames to their team names
  const userToTeamsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    usersFullList.forEach((u: any) => {
      if (u.name) {
        const rawTeams = Array.isArray(u.team_ids) ? u.team_ids : [];
        const cleanTeams = rawTeams
          .map((t: any) => t?.toString().replace(/[\[\]"]/g, '').trim())
          .filter((t: string) => t && t !== "");
        map[u.name] = cleanTeams;
      }
    });
    return map;
  }, [usersFullList]);

  // Dynamically resolve team info based on subtask assignees
  const getTaskTeams = useCallback((taskSubtasks: any[], fallbackTeamName: string = '') => {
    return getTaskTeamsShared(taskSubtasks, fallbackTeamName, userToTeamsMap);
  }, [userToTeamsMap]);

  useEffect(() => {
    // Run background cache updates silently
    fetchDailyTasks(startDate, endDate, true, true);
    fetchMetadata(true);
    setDates(startDate, endDate);
  }, [startDate, endDate]);

  // Generate frontend trackable virtual tasks for DAILY, WEEKLY, MONTHLY, and ONETIME types within startDate & endDate
  const virtualTasks = useMemo(() => {
    const list: VirtualTask[] = [];

    dailyTasks.forEach(task => {
      const type = (task.task_type || 'DAILY').toUpperCase();
      const isRecurring = ['DAILY', 'WEEKLY', 'MONTHLY', 'ONETIME'].includes(type);

      const createdAtStr = task.created_at;
      // Convert deadline_days to string for getVirtualOccurrences if it's an array
      let deadlineDaysStr = '';
      if (Array.isArray(task.deadline_days)) {
        deadlineDaysStr = task.deadline_days.join(', ');
      } else {
        deadlineDaysStr = task.deadline_days || '';
      }

      if (isRecurring) {
        const occurrences = getVirtualOccurrences(
          type,
          deadlineDaysStr,
          createdAtStr,
          startDate,
          endDate
        );
        occurrences.forEach(occ => {
          // Look up if there is a task log for this occ.todo_date
          const matchedLog = task.task_logs?.find((l: any) => l.todo_date === occ.todo_date);
          const todo_status = matchedLog ? (matchedLog.status || 'NEW') : 'NEW';

          // RULE: If template is inactive (OFF), only keep historical done or skipped days!
          if (!task.is_active && todo_status !== 'DONE' && todo_status !== 'SKIPPED') {
            return;
          }

          const hasLogRecord = !!matchedLog;
          const isDoneOrSkipped = todo_status === 'DONE' || todo_status === 'SKIPPED';
          const useLogData = hasLogRecord;
          
          const meta = parseTaskDescription(task.description);
          const project_name = (useLogData && matchedLog && matchedLog.project_name) 
            ? matchedLog.project_name 
            : (task.projects?.name || meta.project_name || task.project_name || '');
          const team_name = (useLogData && matchedLog && matchedLog.team_name)
            ? matchedLog.team_name 
            : (meta.team_name || task.team_name || '');
          const tag_name = (useLogData && matchedLog && matchedLog.tag_name) 
            ? matchedLog.tag_name 
            : (task.tags?.name || meta.tag_name || task.tag_name || '');
          const resolved_title = (useLogData && matchedLog && matchedLog.title)
            ? matchedLog.title
            : (task.title || '');
          const resolved_deadline_time = (useLogData && matchedLog && matchedLog.deadline_time)
            ? matchedLog.deadline_time
            : (task.deadline_time || '17:00');
          const resolved_deadline_days = (useLogData && matchedLog && matchedLog.deadline_days)
            ? matchedLog.deadline_days
            : deadlineDaysStr;
          const resolved_task_type = (useLogData && matchedLog && matchedLog.task_type)
            ? matchedLog.task_type
            : type;

          // Map subtasks for this occurrence date
          const matchedLogsForDate = useLogData 
            ? (task.subtask_logs || []).filter((l: any) => l.todo_date === occ.todo_date)
            : [];

          let sub_tasks: any[] = [];
          if (useLogData && matchedLogsForDate.length > 0) {
            sub_tasks = matchedLogsForDate.map((log: any) => {
              const sUpper = (log.status || '').toUpperCase();
              let sub_status: 'New' | 'Done' | 'Skipped' = 'New';
              if (sUpper === 'DONE' || sUpper === 'SUBMITTED') sub_status = 'Done';
              else if (sUpper === 'SKIPPED') sub_status = 'Skipped';
              else if (sUpper === 'NEW') sub_status = 'New';
              else if (log.is_completed) sub_status = 'Done';

              return {
                id: log.subtask_id || log.id,
                task_id: task.id,
                name: log.content || '',
                content: log.content || '',
                assignee: log.assignee || '',
                est_time: log.est_time !== undefined && log.est_time !== null ? log.est_time : (log.estimated_minutes !== undefined ? log.estimated_minutes : 0),
                actual_time: (sub_status === 'New' && (log.actual_time === 0 || log.actual_time === undefined || log.actual_time === null))
                  ? undefined
                  : (log.actual_time !== undefined && log.actual_time !== null ? log.actual_time : (log.actual_minutes !== undefined ? log.actual_minutes : (sub_status === 'Done' ? (log.est_time || log.estimated_minutes || 0) : 0))),
                sub_status,
                team_name: log.team_name || ''
              };
            });
          } else {
            sub_tasks = (task.subtasks || []).map((sub: any) => {
              const log = sub.subtask_logs?.find((l: any) => l.todo_date === occ.todo_date);
              let sub_status: 'New' | 'Done' | 'Skipped' = 'New';
              if (log) {
                const sUpper = (log.status || '').toUpperCase();
                if (sUpper === 'DONE' || sUpper === 'SUBMITTED') sub_status = 'Done';
                else if (sUpper === 'SKIPPED') sub_status = 'Skipped';
                else if (sUpper === 'NEW') sub_status = 'New';
                else if (log.is_completed) sub_status = 'Done';
              }

              const log_actual = log ? (log.actual_time !== undefined && log.actual_time !== null ? log.actual_time : log.actual_minutes) : undefined;
              let resolved_actual = undefined;
              if (sub_status === 'Done') {
                resolved_actual = log_actual !== undefined && log_actual !== null ? log_actual : (sub.est_time || sub.estimated_minutes);
              } else if (sub_status === 'Skipped') {
                resolved_actual = 0;
              } else {
                resolved_actual = (log_actual === 0 || log_actual === undefined || log_actual === null) ? undefined : log_actual;
              }

              return {
                ...sub,
                id: sub.id,
                name: sub.name || sub.content,
                content: sub.content || sub.name,
                assignee: sub.assignee,
                est_time: sub.est_time !== undefined ? sub.est_time : (sub.estimated_minutes || 0),
                actual_time: resolved_actual,
                sub_status
              };
            });
          }

          // Sum calculations for parent est_time and actual_time
          const calc_est_time = (isDoneOrSkipped && matchedLog && matchedLog.est_time !== undefined && matchedLog.est_time !== null)
            ? matchedLog.est_time
            : sub_tasks.reduce((sum, s) => sum + (Number(s.est_time) || 0), 0);
          
          const calc_actual_time = sub_tasks.reduce((sum, s) => sum + (s.sub_status === 'Done' ? (Number(s.actual_time) || 0) : 0), 0);

          list.push({
            ...task,
            title: resolved_title,
            task_type: resolved_task_type,
            project_name,
            team_name,
            tag_name,
            deadline_time: resolved_deadline_time,
            deadline_days: resolved_deadline_days,
            est_time: calc_est_time,
            actual_time: calc_actual_time,
            virtual_id: `${task.id}_${occ.completion_key}`,
            todo_date: occ.todo_date,
            todo_status,
            sub_tasks,
            completion_key: occ.completion_key
          });
        });
      } else {
        const dates = getDatesBetween(startDate, endDate);
        dates.forEach(todo_date => {
          const fallbackDate = task.todo_date || task.deadline_date || (task.created_at ? task.created_at.split('T')[0] : getTodayDateString());
          
          const hasLogForDate = task.task_logs?.some((l: any) => l.todo_date === todo_date);
          const isTargetDate = fallbackDate === todo_date;

          // RULE: If ONETIME is inactive (OFF), only keep if done or skipped!
          const matchedLog = task.task_logs?.find((l: any) => l.todo_date === todo_date);
          const todo_status = matchedLog ? (matchedLog.status || 'NEW') : 'NEW';

          if (!task.is_active && todo_status !== 'DONE' && todo_status !== 'SKIPPED') {
            return;
          }

          if (isTargetDate || hasLogForDate) {
            const hasLogRecord = !!matchedLog;
            const isDoneOrSkipped = todo_status === 'DONE' || todo_status === 'SKIPPED';
            const useLogData = hasLogRecord;
            
            const meta = parseTaskDescription(task.description);
            const project_name = (useLogData && matchedLog && matchedLog.project_name) 
              ? matchedLog.project_name 
              : (task.projects?.name || meta.project_name || task.project_name || '');
            const team_name = (useLogData && matchedLog && matchedLog.team_name)
              ? matchedLog.team_name 
              : (meta.team_name || task.team_name || '');
            const tag_name = (useLogData && matchedLog && matchedLog.tag_name) 
              ? matchedLog.tag_name 
              : (task.tags?.name || meta.tag_name || task.tag_name || '');
            const resolved_title = (useLogData && matchedLog && matchedLog.title)
              ? matchedLog.title
              : (task.title || '');
            const resolved_deadline_time = (useLogData && matchedLog && matchedLog.deadline_time)
              ? matchedLog.deadline_time
              : (task.deadline_time || '17:00');
            const resolved_deadline_days = (useLogData && matchedLog && matchedLog.deadline_days)
              ? matchedLog.deadline_days
              : deadlineDaysStr;
            const resolved_task_type = (useLogData && matchedLog && matchedLog.task_type)
              ? matchedLog.task_type
              : type;

            const matchedLogsForDate = useLogData 
              ? (task.subtask_logs || []).filter((l: any) => l.todo_date === todo_date)
              : [];

            let sub_tasks: any[] = [];
            if (useLogData && matchedLogsForDate.length > 0) {
              sub_tasks = matchedLogsForDate.map((log: any) => {
                const sUpper = (log.status || '').toUpperCase();
                let sub_status: 'New' | 'Done' | 'Skipped' = 'New';
                if (sUpper === 'DONE' || sUpper === 'SUBMITTED') sub_status = 'Done';
                else if (sUpper === 'SKIPPED') sub_status = 'Skipped';
                else if (sUpper === 'NEW') sub_status = 'New';
                else if (log.is_completed) sub_status = 'Done';

                return {
                  id: log.subtask_id || log.id,
                  task_id: task.id,
                  name: log.content || '',
                  content: log.content || '',
                  assignee: log.assignee || '',
                  est_time: log.est_time !== undefined && log.est_time !== null ? log.est_time : (log.estimated_minutes !== undefined ? log.estimated_minutes : 0),
                  actual_time: log.actual_time !== undefined && log.actual_time !== null ? log.actual_time : (log.actual_minutes !== undefined ? log.actual_minutes : (sub_status === 'Done' ? (log.est_time || log.estimated_minutes || 0) : 0)),
                  sub_status,
                  team_name: log.team_name || ''
                };
              });
            } else {
              sub_tasks = (task.subtasks || []).map((sub: any) => {
                const log = sub.subtask_logs?.find((l: any) => l.todo_date === todo_date);
                let sub_status: 'New' | 'Done' | 'Skipped' = 'New';
                if (log) {
                  const sUpper = (log.status || '').toUpperCase();
                  if (sUpper === 'DONE' || sUpper === 'SUBMITTED') sub_status = 'Done';
                  else if (sUpper === 'SKIPPED') sub_status = 'Skipped';
                  else if (sUpper === 'NEW') sub_status = 'New';
                  else if (log.is_completed) sub_status = 'Done';
                }
                const log_actual = log ? (log.actual_time !== undefined && log.actual_time !== null ? log.actual_time : log.actual_minutes) : undefined;
                let resolved_actual = undefined;
                if (sub_status === 'Done') {
                  resolved_actual = log_actual !== undefined && log_actual !== null ? log_actual : (sub.est_time !== undefined && sub.est_time !== null ? sub.est_time : (sub.estimated_minutes !== undefined ? sub.estimated_minutes : 0));
                } else if (sub_status === 'Skipped') {
                  resolved_actual = 0;
                } else {
                  resolved_actual = log_actual;
                }
                return {
                  ...sub,
                  id: sub.id,
                  name: sub.name || sub.content,
                  content: sub.content || sub.name,
                  assignee: sub.assignee,
                  est_time: sub.est_time !== undefined ? sub.est_time : (sub.estimated_minutes || 0),
                  actual_time: resolved_actual,
                  sub_status
                };
              });
            }

            const calc_est_time = (isDoneOrSkipped && matchedLog && matchedLog.est_time !== undefined && matchedLog.est_time !== null)
              ? matchedLog.est_time
              : sub_tasks.reduce((sum, s) => sum + (Number(s.est_time) || 0), 0);

            const calc_actual_time = sub_tasks.reduce((sum, s) => sum + (s.sub_status === 'Done' ? (Number(s.actual_time) || 0) : 0), 0);

            list.push({
              ...task,
              title: resolved_title,
              task_type: resolved_task_type,
              project_name,
              team_name,
              tag_name,
              deadline_time: resolved_deadline_time,
              deadline_days: resolved_deadline_days,
              est_time: calc_est_time,
              actual_time: calc_actual_time,
              virtual_id: `${task.id}_${todo_date}`,
              todo_date,
              todo_status,
              sub_tasks
            });
          }
        });
      }
    });

    return list;
  }, [dailyTasks, startDate, endDate]);

  // Sync opened task dynamically inside the slider drawer (skip when actively editing)
  useEffect(() => {
    if (openedTask && !drawerHasChanges) {
      const updatedOpenedTask = virtualTasks.find(t => t.virtual_id === openedTask.virtual_id);
      if (updatedOpenedTask) {
        const strA = JSON.stringify(updatedOpenedTask);
        const strB = JSON.stringify(openedTask);
        if (strA !== strB) {
          setOpenedTask(updatedOpenedTask);
        }
      }
    }
  }, [virtualTasks, openedTask, drawerHasChanges]);

  // Extract dynamically options list
  const assigneesOptions = useMemo(() => {
    if (selectedTeams.length > 0) {
      return assigneesList.filter(person => {
        const teams = userToTeamsMap[person] || [];
        return teams.some(t => selectedTeams.includes(t));
      });
    }
    return assigneesList;
  }, [assigneesList, selectedTeams, userToTeamsMap]);

  const tagsOptions = useMemo(() => {
    return tagsList;
  }, [tagsList]);

  const projectsOptions = useMemo(() => {
    return projectsList;
  }, [projectsList]);

  const teamsOptions = useMemo(() => {
    return teamsList;
  }, [teamsList]);

  const isDefaultFilters = useMemo(() => {
    return (
      searchQuery === '' &&
      filterAssignee === (activeUser?.name || '') &&
      filterTag === '' &&
      filterProject === '' &&
      filterTeam === '' &&
      filterTodoStatus === 'NEW' &&
      filterTaskType === '' &&
      startDate === getTodayDateString() &&
      endDate === getTodayDateString()
    );
  }, [searchQuery, filterAssignee, filterTag, filterProject, filterTeam, filterTodoStatus, filterTaskType, startDate, endDate, activeUser?.name]);

  // Filter logic
  const filteredTasks = useMemo(() => {
    return virtualTasks.filter(task => {
      // 1. Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const displayId = getDisplayId(task);
        const matchTitle = (task.title || '').toLowerCase().includes(query);
        const matchId = displayId.includes(query);
        if (!matchTitle && !matchId) return false;
      }

      // 2. Assignee / Personnel filter
      if (filterAssignee) {
        if (filterAssignee === 'ME') {
          const myName = (profile?.name || '').toLowerCase().trim();
          const hasInSubTask = task.sub_tasks.some(s => (s.assignee || '').toLowerCase().trim() === myName);
          const hasInMain = task.assignees?.some(a => (a || '').toLowerCase().trim() === myName);
          if (!hasInSubTask && !hasInMain) return false;
        } else {
          const hasInSubTask = task.sub_tasks.some(s => s.assignee === filterAssignee);
          const hasInMain = task.assignees?.includes(filterAssignee);
          if (!hasInSubTask && !hasInMain) return false;
        }
      }

      // 3. Tag filter
      if (filterTag && task.tag_name !== filterTag) return false;

      // 4. Project filter
      if (filterProject && task.project_name !== filterProject) return false;

      // 5. Team filter
      if (selectedTeams.length > 0) {
        const { allTeams } = getTaskTeams(task.sub_tasks, task.team_name);
        const hasMatchingTeam = allTeams.some(t => selectedTeams.includes(t));
        if (!hasMatchingTeam) return false;
      }

      // 6. To-do checklist status filter ('NEW' | 'DONE' | 'SKIPPED')
      if (filterTodoStatus && task.todo_status !== filterTodoStatus) return false;

      // 6.5. Task Type filter
      if (selectedTaskTypes.length > 0) {
        if (!selectedTaskTypes.includes((task.task_type || '').toUpperCase())) return false;
      }

      // 7. Date Filter (matched to todo_date or creation date boundary)
      if (startDate && endDate) {
        const taskDate = task.todo_date;
        if (taskDate < startDate || taskDate > endDate) return false;
      }

      return true;
    }).sort((a, b) => {
      // 1. Group/Sort by execution date (To-do items of different dates should not mix)
      const dateA = a.todo_date || '';
      const dateB = b.todo_date || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);

      // 2. Deadline: from early to late
      const minA = parseTimeToMinutes(a.deadline_time || '');
      const minB = parseTimeToMinutes(b.deadline_time || '');
      if (minA !== minB) return minA - minB;

      // 3. Type: DAILY -> WEEKLY -> MONTHLY -> ONETIME
      const rankA = getTypeRank(a.task_type || '');
      const rankB = getTypeRank(b.task_type || '');
      if (rankA !== rankB) return rankA - rankB;

      // 4. Team: A~Z
      const teamA = a.team_name || '';
      const teamB = b.team_name || '';
      const teamCompare = teamA.localeCompare(teamB, undefined, { sensitivity: 'base' });
      if (teamCompare !== 0) return teamCompare;

      // 5. Tag: A~Z
      const tagA = a.tag_name || '';
      const tagB = b.tag_name || '';
      const tagCompare = tagA.localeCompare(tagB, undefined, { sensitivity: 'base' });
      if (tagCompare !== 0) return tagCompare;

      // 6. Project: A~Z
      const projA = a.project_name || '';
      const projB = b.project_name || '';
      const projCompare = projA.localeCompare(projB, undefined, { sensitivity: 'base' });
      if (projCompare !== 0) return projCompare;

      // 7. Task name: A~Z
      const titleA = a.title || '';
      const titleB = b.title || '';
      return titleA.localeCompare(titleB, undefined, { sensitivity: 'base' });
    });
  }, [virtualTasks, searchQuery, filterAssignee, filterTag, filterProject, filterTeam, filterTodoStatus, selectedTaskTypes, startDate, endDate, profile, getTaskTeams]);

  // Paginated client side calculation
  const totalCount = filteredTasks.length;
  const totalSubtasksCount = useMemo(() => {
    return filteredTasks.reduce((sum, task) => sum + (task.sub_tasks?.length || 0), 0);
  }, [filteredTasks]);
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const paginatedTasks = useMemo(() => {
    const startIdx = (page - 1) * pageSize;
    return filteredTasks.slice(startIdx, startIdx + pageSize);
  }, [filteredTasks, page]);

  // Generate responsive pagination item array with ellipsis (...)
  const getPaginationItems = useCallback(() => {
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
  }, [page, totalPages]);

  // Handle checking checkbox
  const handleToggleSelectRow = (virtualId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(virtualId)) {
        next.delete(virtualId);
        setIsAllPagesSelected(false);
      } else {
        next.add(virtualId);
      }
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedTaskIds.size === paginatedTasks.length) {
      setSelectedTaskIds(new Set());
      setIsAllPagesSelected(false);
    } else {
      setSelectedTaskIds(new Set(paginatedTasks.map(t => t.virtual_id)));
      setIsAllPagesSelected(false);
    }
  };

  // Submit task from actions button, preserving Skipped states
  const handleDirectSubmit = async (task: VirtualTask) => {
    try {
      const updaterName = activeUser?.name || profile?.name || currentUser?.email || 'System';

      const calculatedActual = (task.sub_tasks || []).reduce(
        (sum, s) => sum + (s.sub_status === 'Done' ? (Number(s.actual_time) || Number((s as any).actual_minutes) || s.est_time || (s as any).estimated_minutes || 0) : (s.est_time || (s as any).estimated_minutes || 0)),
        0
      ) || task.est_time || 0;

      // 1. Determine status of subtasks and build the log payloads
      const subtaskLogsToSave = (task.sub_tasks || []).map(sub => {
        const rawStatus = sub.sub_status || 'New';
        const finalStatus = rawStatus === 'Skipped' ? 'SKIPPED' : 'DONE';
        const isCompleted = finalStatus === 'DONE';
        const calcAct = finalStatus === 'DONE' ? (sub.actual_time !== undefined && sub.actual_time !== null ? sub.actual_time : (sub.actual_minutes !== undefined && sub.actual_minutes !== null ? sub.actual_minutes : (sub.estimated_minutes || sub.est_time || 0))) : 0;
        
        return {
          subtask_id: sub.id,
          task_id: task.id,
          todo_date: task.todo_date,
          status: finalStatus,
          is_completed: isCompleted,
          completed_by: updaterName,
          team_name: sub.team_name || '',
          content: sub.content || sub.name || '',
          assignee: sub.assignee || '',
          est_time: sub.est_time || (sub as any).estimated_minutes || 0,
          actual_time: calcAct
        };
      });

      // 2. Determine parent task status
      const allSkipped = subtaskLogsToSave.length > 0 && subtaskLogsToSave.every(s => s.status === 'SKIPPED');
      const newStatus = allSkipped ? 'SKIPPED' : 'DONE';

      // 3. Save subtask logs to DB
      if (subtaskLogsToSave.length > 0) {
        await Promise.all(subtaskLogsToSave.map(async (payload) => {
          await supabase
            .from('subtask_logs')
            .upsert(payload, { onConflict: 'subtask_id,todo_date' });
        }));
      }

      // 4. Save parent task log to DB
      const { error: logErr } = await supabase
        .from('task_logs')
        .upsert({
          task_id: task.id,
          todo_date: task.todo_date,
          status: newStatus,
          updated_by: updaterName,
          title: task.title || '',
          project_name: task.project_name || '',
          tag_name: task.tag_name || '',
          deadline_time: task.deadline_time || '17:00',
          deadline_days: task.deadline_days || '',
          task_type: task.task_type || 'DAILY',
          est_time: task.est_time || 0,
          actual_time: calculatedActual
        }, {
          onConflict: 'task_id,todo_date'
        });

      if (logErr) throw logErr;

      // 5. Update dailyTasks locally in useAppStore
      useAppStore.setState(state => {
        const nextDailyTasks = state.dailyTasks.map(t => {
          if (t.id === task.id) {
            // Task Log Update
            const logs = [...(t.task_logs || [])];
            const existingLogIndex = logs.findIndex((l: any) => l.todo_date === task.todo_date);
            const taskLogPayload = {
              task_id: task.id,
              todo_date: task.todo_date,
              status: newStatus,
              updated_by: updaterName,
              title: task.title || '',
              project_name: task.project_name || '',
              tag_name: task.tag_name || '',
              deadline_time: task.deadline_time || '17:00',
              deadline_days: task.deadline_days || '',
              task_type: task.task_type || 'DAILY',
              est_time: task.est_time || 0,
              actual_time: calculatedActual
            };
            if (existingLogIndex >= 0) {
              logs[existingLogIndex] = { ...logs[existingLogIndex], ...taskLogPayload };
            } else {
              logs.push(taskLogPayload);
            }

            // Subtasks Logs Update
            const nextSubtasks = (t.subtasks || []).map((subItem: any) => {
              const matchedSub = subtaskLogsToSave.find(s => s.subtask_id === subItem.id);
              if (matchedSub) {
                const subLogs = [...(subItem.subtask_logs || [])];
                const subLogIndex = subLogs.findIndex((sl: any) => sl.todo_date === task.todo_date);
                if (subLogIndex >= 0) {
                  subLogs[subLogIndex] = { ...subLogs[subLogIndex], ...matchedSub };
                } else {
                  subLogs.push(matchedSub);
                }
                return { ...subItem, subtask_logs: subLogs };
              }
              return subItem;
            });

            // Update subtask_logs field at parent task level
            const nextGlobalSubLogs = [...(t.subtask_logs || [])];
            subtaskLogsToSave.forEach(subPayload => {
              const slIdx = nextGlobalSubLogs.findIndex(sl => sl.subtask_id === subPayload.subtask_id && sl.todo_date === task.todo_date);
              if (slIdx >= 0) {
                nextGlobalSubLogs[slIdx] = { ...nextGlobalSubLogs[slIdx], ...subPayload };
              } else {
                nextGlobalSubLogs.push(subPayload);
              }
            });

            return {
              ...t,
              task_logs: logs,
              subtask_logs: nextGlobalSubLogs,
              subtasks: nextSubtasks
            };
          }
          return t;
        });
        return { dailyTasks: nextDailyTasks };
      });

      if (openedTask && openedTask.id === task.id && openedTask.todo_date === task.todo_date) {
        setOpenedTask(null);
      }

      await logger.log('SUBMIT_TASK', `Submitted task [${getDisplayId(task)}]: ${task.title || 'Untitled'} (${task.todo_date})`, { taskId: task.id, finalStatus: newStatus });
      await checkAndToggleOnetimeTemplateStatus(task.id);
      toast.success('Task completed successfully!');
    } catch (err: any) {
      console.error('Error submitting task:', err);
      toast.error(`An error occurred during submit: ${err.message || 'Unknown error'}`);
    }
  };

  // Reset task back to NEW or other status adjustments inside the slider drawer
  const handleResetTask = async (task: VirtualTask) => {
    // Lock reset task feature for standard user role
    if (isUser) {
      toast.error("You do not have permission to reset tasks!");
      return;
    }

    try {
      // 1. Update task log to NEW and actual_time to 0
      const { error: logErr } = await supabase
        .from('task_logs')
        .update({ status: 'NEW', actual_time: 0 })
        .eq('task_id', task.id)
        .eq('todo_date', task.todo_date);

      if (logErr) throw logErr;

      // 2. Update subtask logs to NEW, is_completed = false, actual_time to 0
      const { error: subLogsErr } = await supabase
        .from('subtask_logs')
        .update({ status: 'NEW', is_completed: false, actual_time: 0 })
        .eq('task_id', task.id)
        .eq('todo_date', task.todo_date);

      if (subLogsErr) throw subLogsErr;

      // 3. Update dailyTasks locally in useAppStore (update logs instead of deleting them)
      useAppStore.setState(state => {
        const nextDailyTasks = state.dailyTasks.map(t => {
          if (t.id === task.id) {
            const logs = (t.task_logs || []).map((l: any) => {
              if (l.todo_date === task.todo_date) {
                return { ...l, status: 'NEW', actual_time: 0 };
              }
              return l;
            });
            
            const globalSubLogs = (t.subtask_logs || []).map((sl: any) => {
              if (sl.todo_date === task.todo_date) {
                return { ...sl, status: 'NEW', is_completed: false, actual_time: 0 };
              }
              return sl;
            });

            const nextSubtasks = (t.subtasks || []).map((subItem: any) => {
              const subLogs = (subItem.subtask_logs || []).map((sl: any) => {
                if (sl.todo_date === task.todo_date) {
                  return { ...sl, status: 'NEW', is_completed: false, actual_time: 0 };
                }
                return sl;
              });
              return { ...subItem, subtask_logs: subLogs };
            });

            return {
              ...t,
              task_logs: logs,
              subtask_logs: globalSubLogs,
              subtasks: nextSubtasks
            };
          }
          return t;
        });
        return { dailyTasks: nextDailyTasks };
      });

      if (openedTask && openedTask.id === task.id && openedTask.todo_date === task.todo_date) {
        setOpenedTask({
          ...openedTask,
          todo_status: 'NEW',
          sub_tasks: (openedTask.sub_tasks || []).map(st => ({
            ...st,
            sub_status: 'New',
            actual_time: undefined
          }))
        });
      }

      await logger.log('RESET_TASK', `Reset task status [${getDisplayId(task)}]: ${task.title || 'Untitled'} (${task.todo_date})`, { taskId: task.id });
      await checkAndToggleOnetimeTemplateStatus(task.id);
      toast.success('Task reset successfully!');
    } catch (err: any) {
      console.error('Error resetting task:', err);
      toast.error(`Reset failed: ${err.message || 'Unknown error'}`);
    }
  };

  // Skip task checklist representation completely
  const handleSkipTask = async (task: VirtualTask) => {
    try {
      const updaterName = activeUser?.name || profile?.name || currentUser?.email || 'System';
      
      // 1. Upsert down to task_logs
      const { error: logErr } = await supabase
        .from('task_logs')
        .upsert({
          task_id: task.id,
          todo_date: task.todo_date,
          status: 'SKIPPED',
          updated_by: updaterName,
          title: task.title || '',
          project_name: task.project_name || '',
          tag_name: task.tag_name || '',
          deadline_time: task.deadline_time || '17:00',
          deadline_days: task.deadline_days || '',
          task_type: task.task_type || 'DAILY',
          est_time: task.est_time || 0
        }, {
          onConflict: 'task_id,todo_date'
        });

      if (logErr) throw logErr;

      // 2. Also upsert all subtask logs of this task to SKIPPED for this date
      await Promise.all((task.sub_tasks || []).map(async (sub) => {
        await supabase
          .from('subtask_logs')
          .upsert({
            subtask_id: sub.id,
            task_id: task.id,
            todo_date: task.todo_date,
            status: 'SKIPPED',
            is_completed: false,
            completed_by: updaterName,
            team_name: sub.team_name || '',
            content: sub.content || sub.name || '',
            assignee: sub.assignee || '',
            est_time: sub.est_time || (sub as any).estimated_minutes || 0,
            actual_time: 0
          }, {
            onConflict: 'subtask_id,todo_date'
          });
      }));

      // 3. Update dailyTasks locally in useAppStore
      useAppStore.setState(state => {
        const nextDailyTasks = state.dailyTasks.map(t => {
          if (t.id === task.id) {
            // Task Log Update
            const logs = [...(t.task_logs || [])];
            const existingLogIndex = logs.findIndex((l: any) => l.todo_date === task.todo_date);
            const taskLogPayload = {
              task_id: task.id,
              todo_date: task.todo_date,
              status: 'SKIPPED',
              updated_by: updaterName,
              title: task.title || '',
              project_name: task.project_name || '',
              tag_name: task.tag_name || '',
              deadline_time: task.deadline_time || '17:00',
              deadline_days: task.deadline_days || '',
              task_type: task.task_type || 'DAILY',
              est_time: task.est_time || 0,
              actual_time: 0
            };
            if (existingLogIndex >= 0) {
              logs[existingLogIndex] = { ...logs[existingLogIndex], ...taskLogPayload };
            } else {
              logs.push(taskLogPayload);
            }

            // Subtasks Logs Update
            const nextSubtasks = (t.subtasks || []).map((subItem: any) => {
              const subLogs = [...(subItem.subtask_logs || [])];
              const subLogIndex = subLogs.findIndex((sl: any) => sl.todo_date === task.todo_date);
              const subLogPayload = {
                subtask_id: subItem.id,
                task_id: task.id,
                todo_date: task.todo_date,
                status: 'SKIPPED',
                is_completed: false,
                completed_by: updaterName,
                content: subItem.content || subItem.name || '',
                assignee: subItem.assignee || '',
                est_time: subItem.est_time || 0,
                actual_time: 0
              };
              if (subLogIndex >= 0) {
                subLogs[subLogIndex] = { ...subLogs[subLogIndex], ...subLogPayload };
              } else {
                subLogs.push(subLogPayload);
              }
              return { ...subItem, subtask_logs: subLogs };
            });

            // Update subtask_logs field at parent task level
            const nextGlobalSubLogs = [...(t.subtask_logs || [])];
            (task.sub_tasks || []).forEach(sub => {
              const slIdx = nextGlobalSubLogs.findIndex(sl => sl.subtask_id === sub.id && sl.todo_date === task.todo_date);
              const payload = {
                subtask_id: sub.id,
                task_id: task.id,
                todo_date: task.todo_date,
                status: 'SKIPPED',
                is_completed: false,
                completed_by: updaterName,
                content: sub.content || sub.name || '',
                assignee: sub.assignee || '',
                est_time: sub.est_time || 0,
                actual_time: 0
              };
              if (slIdx >= 0) {
                nextGlobalSubLogs[slIdx] = { ...nextGlobalSubLogs[slIdx], ...payload };
              } else {
                nextGlobalSubLogs.push(payload);
              }
            });

            return {
              ...t,
              task_logs: logs,
              subtask_logs: nextGlobalSubLogs,
              subtasks: nextSubtasks
            };
          }
          return t;
        });
        return { dailyTasks: nextDailyTasks };
      });

      if (openedTask && openedTask.id === task.id && openedTask.todo_date === task.todo_date) {
        setOpenedTask({
          ...openedTask,
          todo_status: 'SKIPPED'
        });
      }

      await logger.log('SKIP_TASK', `Skipped task [${getDisplayId(task)}]: ${task.title || 'Untitled'} (${task.todo_date})`, { taskId: task.id });
      await checkAndToggleOnetimeTemplateStatus(task.id);
      toast.success('Task skipped successfully!');
    } catch (err: any) {
      console.error('Error skipping task:', err);
      toast.error(`Skip failed: ${err.message || 'Unknown error'}`);
    }
  };

  // Update specific sub-task work characteristics (Actual Minutes or Status) inside the drawer locally
  const handleUpdateSubtaskValueLocal = (
    subtaskId: string, 
    fields: Partial<Pick<SubTask, 'actual_time' | 'sub_status'>>
  ) => {
    if (!openedTask) return;

    const updatedSubTasks = (openedTask.sub_tasks || []).map(sub => {
      if (sub.id === subtaskId) {
        const incomingMinutes = fields.actual_time;
        const boundedMinutes = incomingMinutes !== undefined 
          ? Math.min(10000, Math.max(0, incomingMinutes)) 
          : undefined;

        return {
          ...sub,
          ...fields,
          ...(boundedMinutes !== undefined ? { actual_time: boundedMinutes } : {}),
          last_updated_by: activeUser?.name || 'Unknown',
          last_updated_at: new Date().toISOString()
        };
      }
      return sub;
    });

    // Always calculate parent's total est_time and actual_time as the sum of subtasks
    const calculated_est_time = updatedSubTasks.reduce((sum, sub) => sum + (Number(sub.est_time) || 0), 0);
    const calculated_actual_time = updatedSubTasks.reduce((sum, sub) => sum + (sub.sub_status === 'Done' ? (Number(sub.actual_time) || 0) : 0), 0);

    setOpenedTask({
      ...openedTask,
      sub_tasks: updatedSubTasks,
      est_time: calculated_est_time,
      actual_time: calculated_actual_time
    });
    setDrawerHasChanges(true);
  };

  // Save accumulated sub-task changes to Supabase upon drawer closing
  const saveOpenedTaskChanges = async (taskToSave: VirtualTask) => {
    try {
      const completedBy = activeUser?.name || activeUser?.email || 'Unknown';

      // Save subtask logs to DB as well for each subtask to ensure perfect synchronization
      await Promise.all((taskToSave.sub_tasks || []).map(async (sub) => {
        const nextVal = sub.sub_status || 'New';
        const statusUpper = nextVal.toUpperCase();
        const isCompleted = nextVal === 'Done';
        const calcAct = isCompleted ? (sub.actual_time !== undefined && sub.actual_time !== null ? sub.actual_time : ((sub as any).actual_minutes !== undefined && (sub as any).actual_minutes !== null ? (sub as any).actual_minutes : (sub.est_time || (sub as any).estimated_minutes || 0))) : 0;
        
        await supabase
          .from('subtask_logs')
          .upsert({
            subtask_id: sub.id,
            task_id: taskToSave.id,
            todo_date: taskToSave.todo_date,
            status: statusUpper,
            is_completed: isCompleted,
            completed_by: completedBy,
            team_name: sub.team_name || '',
            content: sub.content || sub.name || '',
            assignee: sub.assignee || '',
            est_time: sub.est_time || (sub as any).estimated_minutes || 0,
            actual_time: calcAct
          }, {
            onConflict: 'subtask_id,todo_date'
          });
      }));

      // In RDBMS mode, let's also update the task_logs status to DONE if everything is Done, or handle normally
      const hasNewSubTask = (taskToSave.sub_tasks || []).some(sub => (sub.sub_status || 'New') === 'New');
      const allSkipped = (taskToSave.sub_tasks || []).every(sub => (sub.sub_status || 'New') === 'Skipped');
      
      const newStatus = allSkipped ? 'SKIPPED' : (hasNewSubTask ? 'NEW' : 'DONE');
      
      const calculatedActual = (taskToSave.sub_tasks || []).reduce(
        (sum, s) => sum + (s.sub_status === 'Done' ? (Number(s.actual_time) || Number((s as any).actual_minutes) || s.est_time || (s as any).estimated_minutes || 0) : (s.est_time || (s as any).estimated_minutes || 0)),
        0
      ) || taskToSave.est_time || 0;

      await supabase
        .from('task_logs')
        .upsert({
          task_id: taskToSave.id,
          todo_date: taskToSave.todo_date,
          status: newStatus,
          updated_by: completedBy,
          title: taskToSave.title || '',
          project_name: taskToSave.project_name || '',
          tag_name: taskToSave.tag_name || '',
          deadline_time: taskToSave.deadline_time || '17:00',
          deadline_days: taskToSave.deadline_days || '',
          task_type: taskToSave.task_type || 'DAILY',
          est_time: taskToSave.est_time || 0,
          actual_time: calculatedActual
        }, {
          onConflict: 'task_id,todo_date'
        });

      // Update dailyTasks locally in useAppStore
      useAppStore.setState(state => {
        const nextDailyTasks = state.dailyTasks.map(t => {
          if (t.id === taskToSave.id) {
            // Update its task_logs
            const logs = [...(t.task_logs || [])];
            const existingLogIndex = logs.findIndex((l: any) => l.todo_date === taskToSave.todo_date);
            const taskLogPayload = {
              task_id: taskToSave.id,
              todo_date: taskToSave.todo_date,
              status: newStatus,
              updated_by: completedBy,
              title: taskToSave.title || '',
              project_name: taskToSave.project_name || '',
              tag_name: taskToSave.tag_name || '',
              deadline_time: taskToSave.deadline_time || '17:00',
              deadline_days: taskToSave.deadline_days || '',
              task_type: taskToSave.task_type || 'DAILY',
              est_time: taskToSave.est_time || 0,
              actual_time: calculatedActual
            };
            if (existingLogIndex >= 0) {
              logs[existingLogIndex] = { ...logs[existingLogIndex], ...taskLogPayload };
            } else {
              logs.push(taskLogPayload);
            }

            // Update subtasks logs
            const nextSubtasks = (t.subtasks || []).map((subItem: any) => {
              const matchingSubToSave = taskToSave.sub_tasks?.find(s => s.id === subItem.id);
              if (matchingSubToSave) {
                const subLogs = [...(subItem.subtask_logs || [])];
                const subLogIndex = subLogs.findIndex((sl: any) => sl.todo_date === taskToSave.todo_date);
                const calcSubAct = matchingSubToSave.sub_status === 'Done' ? (matchingSubToSave.actual_time !== undefined && matchingSubToSave.actual_time !== null ? matchingSubToSave.actual_time : ((matchingSubToSave as any).actual_minutes !== undefined && (matchingSubToSave as any).actual_minutes !== null ? (matchingSubToSave as any).actual_minutes : (matchingSubToSave.est_time || (matchingSubToSave as any).estimated_minutes || 0))) : 0;
                const subLogPayload = {
                  subtask_id: subItem.id,
                  task_id: taskToSave.id,
                  todo_date: taskToSave.todo_date,
                  status: (matchingSubToSave.sub_status || 'New').toUpperCase(),
                  is_completed: matchingSubToSave.sub_status === 'Done',
                  completed_by: completedBy,
                  content: matchingSubToSave.content || matchingSubToSave.name || '',
                  assignee: matchingSubToSave.assignee || '',
                  est_time: matchingSubToSave.est_time || 0,
                  actual_time: calcSubAct
                };
                if (subLogIndex >= 0) {
                  subLogs[subLogIndex] = { ...subLogs[subLogIndex], ...subLogPayload };
                } else {
                  subLogs.push(subLogPayload);
                }
                return {
                  ...subItem,
                  subtask_logs: subLogs
                };
              }
              return subItem;
            });

            // Update subtask_logs field at parent task level
            const nextGlobalSubLogs = [...(t.subtask_logs || [])];
            (taskToSave.sub_tasks || []).forEach(sub => {
              const slIdx = nextGlobalSubLogs.findIndex(sl => sl.subtask_id === sub.id && sl.todo_date === taskToSave.todo_date);
              const calcGlobalAct = sub.sub_status === 'Done' ? (sub.actual_time !== undefined && sub.actual_time !== null ? sub.actual_time : ((sub as any).actual_minutes !== undefined && (sub as any).actual_minutes !== null ? (sub as any).actual_minutes : (sub.est_time || (sub as any).estimated_minutes || 0))) : 0;
              const payload = {
                subtask_id: sub.id,
                task_id: taskToSave.id,
                todo_date: taskToSave.todo_date,
                status: (sub.sub_status || 'New').toUpperCase(),
                is_completed: sub.sub_status === 'Done',
                completed_by: completedBy,
                content: sub.content || sub.name || '',
                assignee: sub.assignee || '',
                est_time: sub.est_time || 0,
                actual_time: calcGlobalAct
              };
              if (slIdx >= 0) {
                nextGlobalSubLogs[slIdx] = { ...nextGlobalSubLogs[slIdx], ...payload };
              } else {
                nextGlobalSubLogs.push(payload);
              }
            });

            return {
              ...t,
              task_logs: logs,
              subtask_logs: nextGlobalSubLogs,
              subtasks: nextSubtasks
            };
          }
          return t;
        });
        return { dailyTasks: nextDailyTasks };
      });

      await checkAndToggleOnetimeTemplateStatus(taskToSave.id);
      toast.success('Changes saved successfully!');
    } catch (err: any) {
      console.error('Error saving task edits on close:', err);
      toast.error(`Failed to save changes: ${err.message || 'Unknown error'}`);
    }
  };

  // Close side drawer after saving pending changes
  const handleCloseDrawer = async () => {
    if (drawerHasChanges && openedTask) {
      await saveOpenedTaskChanges(openedTask);
    }
    setOpenedTask(null);
    setDrawerHasChanges(false);
  };

  // Open side drawer with change check
  const handleOpenTask = async (task: VirtualTask) => {
    if (drawerHasChanges && openedTask) {
      await saveOpenedTaskChanges(openedTask);
    }
    setOpenedTask(task);
    setDrawerHasChanges(false);
  };

  // Export current listings to CSV spreadsheet
  const handleExportCsv = () => {
    if (virtualTasks.length === 0) return;
    
    const headers = [
      'ID', 
      'TASK NAME', 
      'PROJECT', 
      'TAG', 
      'TEAM', 
      'TYPE', 
      'TYPE DETAIL', 
      'DEADLINE DAY', 
      'DEADLINE TIME', 
      'EST TIME', 
      'STATUS', 
      'NOTE',
      'SUBTASK CONTENT', 
      'ASSIGNEE', 
      'ACTUAL TIME', 
      'SUBSTATUS', 
      'LASTUPDATED USER', 
      'LASTUPDATED TIME'
    ];

    const rows: string[][] = [];
    const myName = (profile?.name || '').toLowerCase().trim();

    // Loop through virtual tasks but filter parent-level aspects like project, tag, teams, type, search and date first.
    // Assignee and Status filters are checked and enforced at subtask level instead of parent task level!
    const baseTasks = virtualTasks.filter(task => {
      // 1. Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const displayId = getDisplayId(task);
        const matchTitle = (task.title || '').toLowerCase().includes(query);
        const matchId = displayId.includes(query);
        if (!matchTitle && !matchId) return false;
      }

      // 3. Tag filter
      if (filterTag && task.tag_name !== filterTag) return false;

      // 4. Project filter
      if (filterProject && task.project_name !== filterProject) return false;

      // 5. Team filter
      if (selectedTeams.length > 0) {
        const { allTeams } = getTaskTeams(task.sub_tasks, task.team_name);
        const hasMatchingTeam = allTeams.some(t => selectedTeams.includes(t));
        if (!hasMatchingTeam) return false;
      }

      // 6.5. Task Type filter
      if (selectedTaskTypes.length > 0) {
        if (!selectedTaskTypes.includes((task.task_type || '').toUpperCase())) return false;
      }

      // 7. Date Filter (matched to todo_date or creation date boundary)
      if (startDate && endDate) {
        const taskDate = task.todo_date;
        if (taskDate < startDate || taskDate > endDate) return false;
      }

      return true;
    });

    baseTasks.forEach(task => {
      const parentInfo = [
        `"\t${getDisplayId(task)}"`,
        `"${(task.title || '').replace(/"/g, '""')}"`,
        `"${(task.project_name || '').replace(/"/g, '""')}"`,
        `"${(task.tag_name || '').replace(/"/g, '""')}"`,
        `"${(getTaskTeams(task.sub_tasks, task.team_name).allTeams.join(', ') || 'No Team').replace(/"/g, '""')}"`,
        `"${task.task_type || ''}"`,
        `"${(task.deadline_days || '').replace(/"/g, '""')}"`,
        `"${task.todo_date || ''}"`,
        `"${task.deadline_time || ''}"`,
        `"${task.est_time || 0}m"`,
        `"${task.todo_status || 'NEW'}"`,
        `"${(task.meta?.note || '').replace(/"/g, '""')}"`
      ];

      const isRecurring = ['DAILY', 'WEEKLY', 'MONTHLY'].includes((task.task_type || '').toUpperCase());
      let statusUpdatedBy = '';
      let statusUpdatedAt = '';

      if (isRecurring) {
        const key = task.completion_key || task.todo_date;
        const completion = task.meta?.completions?.[key] || task.meta?.completions?.[task.todo_date];
        if (completion) {
          statusUpdatedBy = completion.updated_by || '';
          statusUpdatedAt = completion.updated_at || '';
        }
      } else {
        statusUpdatedBy = task.meta?.updated_by || '';
        statusUpdatedAt = task.meta?.updated_at || '';
      }

      const lastUpdatedUserCsv = statusUpdatedBy || '';
      const lastUpdatedTimeCsv = statusUpdatedAt ? formatDateTime(statusUpdatedAt) : '';

      const subtasksList = task.sub_tasks || [];

      if (subtasksList.length === 0) {
        // If there are no subtasks, apply filters on the parent task directly
        let matchAssignee = true;
        if (filterAssignee) {
          if (filterAssignee === 'ME') {
            matchAssignee = task.assignees?.some(a => (a || '').toLowerCase().trim() === myName) || false;
          } else {
            matchAssignee = task.assignees?.includes(filterAssignee) || false;
          }
        }

        let matchStatus = true;
        if (filterTodoStatus) {
          matchStatus = task.todo_status === filterTodoStatus;
        }

        if (matchAssignee && matchStatus) {
          rows.push([
            ...parentInfo,
            '""', // SUBTASK CONTENT
            '""', // ASSIGNEE
            '"0m"', // ACTUAL TIME
            '""', // SUBSTATUS
            `"${lastUpdatedUserCsv.replace(/"/g, '""')}"`, // LASTUPDATED USER
            `"${lastUpdatedTimeCsv}"`  // LASTUPDATED TIME
          ]);
        }
      } else {
        // If there are subtasks, filter each subtask individually based on assignee & status!
        subtasksList.forEach((sub: any) => {
          let matchAssignee = true;
          if (filterAssignee) {
            if (filterAssignee === 'ME') {
              matchAssignee = (sub.assignee || '').toLowerCase().trim() === myName;
            } else {
              matchAssignee = sub.assignee === filterAssignee;
            }
          }

          let matchStatus = true;
          if (filterTodoStatus) {
            const subStatusUpper = (sub.sub_status || 'New').toUpperCase();
            if (filterTodoStatus === 'DONE') {
              matchStatus = subStatusUpper === 'DONE';
            } else if (filterTodoStatus === 'SKIPPED') {
              matchStatus = subStatusUpper === 'SKIPPED';
            } else if (filterTodoStatus === 'NEW') {
              matchStatus = subStatusUpper === 'NEW';
            }
          }

          if (matchAssignee && matchStatus) {
            rows.push([
              ...parentInfo,
              `"${(sub.content || '').replace(/"/g, '""')}"`,
              `"${(sub.assignee || '').replace(/"/g, '""')}"`,
              `"${sub.sub_status === 'Skipped' ? 0 : (sub.actual_time !== undefined && sub.actual_time !== null ? sub.actual_time : ((sub as any).actual_minutes !== undefined ? (sub as any).actual_minutes : (sub.est_time || (sub as any).estimated_minutes || 0)))}m"`,
              `"${sub.sub_status || 'New'}"`,
              `"${(lastUpdatedUserCsv || sub.last_updated_by || '').replace(/"/g, '""')}"`,
              `"${lastUpdatedTimeCsv || formatDateTime(sub.last_updated_at)}"`
            ]);
          }
        });
      }
    });

    if (rows.length === 0) return;

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `dym_todo_list_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick Skip batch selected items
  const handleQuickSkipBatch = async () => {
    if (selectedTaskIds.size === 0) {
      setIsQuickSkipMode(false);
      return;
    }

    setLoading(true);
    try {
      const updaterName = activeUser?.name || profile?.name || currentUser?.email || 'System';

      // Record logs for each task
      const logsToUpsert: any[] = [];
      const subLogsToUpsert: any[] = [];

      const updatedIdsMap: Record<string, string> = {};
      const updatedTasksObjects: Record<string, VirtualTask> = {};

      for (const virtualId of selectedTaskIds) {
        const taskObj = virtualTasks.find(t => t.virtual_id === virtualId);
        if (!taskObj) continue;

        logsToUpsert.push({
          task_id: taskObj.id,
          todo_date: taskObj.todo_date,
          status: 'SKIPPED',
          updated_by: updaterName,
          title: taskObj.title || '',
          project_name: taskObj.project_name || '',
          tag_name: taskObj.tag_name || '',
          deadline_time: taskObj.deadline_time || '17:00',
          deadline_days: taskObj.deadline_days || '',
          task_type: taskObj.task_type || 'DAILY',
          est_time: taskObj.est_time || 0,
          actual_time: 0
        });

        (taskObj.sub_tasks || []).forEach(sub => {
          subLogsToUpsert.push({
            subtask_id: sub.id,
            task_id: taskObj.id,
            todo_date: taskObj.todo_date,
            status: 'SKIPPED',
            is_completed: false,
            completed_by: updaterName,
            team_name: sub.team_name || '',
            content: sub.content || sub.name || '',
            assignee: sub.assignee || '',
            est_time: sub.estimated_minutes || sub.est_time || 0,
            actual_time: 0
          });
        });

        updatedIdsMap[taskObj.id] = taskObj.todo_date;
        updatedTasksObjects[taskObj.id] = taskObj;
      }

      // 1. Bulk Upsert Task Logs
      if (logsToUpsert.length > 0) {
        const { error: taskLogsErr } = await supabase
          .from('task_logs')
          .upsert(logsToUpsert, { onConflict: 'task_id,todo_date' });
        if (taskLogsErr) throw taskLogsErr;
      }

      // 2. Bulk Upsert Subtask Logs
      if (subLogsToUpsert.length > 0) {
        const { error: subtaskLogsErr } = await supabase
          .from('subtask_logs')
          .upsert(subLogsToUpsert, { onConflict: 'subtask_id,todo_date' });
        if (subtaskLogsErr) throw subtaskLogsErr;
      }

      // 3. Update useAppStore dailyTasks state locally
      useAppStore.setState(state => {
        const nextDailyTasks = state.dailyTasks.map(t => {
          const targetTodoDate = updatedIdsMap[t.id];
          const originTaskObj = updatedTasksObjects[t.id];
          if (targetTodoDate && originTaskObj) {
            // Task Log payload update
            const logs = [...(t.task_logs || [])];
            const existingLogIndex = logs.findIndex((l: any) => l.todo_date === targetTodoDate);
            const taskLogPayload = {
              task_id: t.id,
              todo_date: targetTodoDate,
              status: 'SKIPPED',
              updated_by: updaterName,
              title: originTaskObj.title || '',
              project_name: originTaskObj.project_name || '',
              tag_name: originTaskObj.tag_name || '',
              deadline_time: originTaskObj.deadline_time || '17:00',
              deadline_days: originTaskObj.deadline_days || '',
              task_type: originTaskObj.task_type || 'DAILY',
              est_time: originTaskObj.est_time || 0,
              actual_time: 0
            };
            if (existingLogIndex >= 0) {
              logs[existingLogIndex] = { ...logs[existingLogIndex], ...taskLogPayload };
            } else {
              logs.push(taskLogPayload);
            }

            // Subtask Logs payload update
            const nextSubtasks = (t.subtasks || []).map((subItem: any) => {
              const subLogs = [...(subItem.subtask_logs || [])];
              const subLogIndex = subLogs.findIndex((sl: any) => sl.todo_date === targetTodoDate);
              const subLogPayload = {
                subtask_id: subItem.id,
                task_id: t.id,
                todo_date: targetTodoDate,
                status: 'SKIPPED',
                is_completed: false,
                completed_by: updaterName,
                content: subItem.content || subItem.name || '',
                assignee: subItem.assignee || '',
                est_time: subItem.est_time || 0,
                actual_time: 0
              };
              if (subLogIndex >= 0) {
                subLogs[subLogIndex] = { ...subLogs[subLogIndex], ...subLogPayload };
              } else {
                subLogs.push(subLogPayload);
              }
              return { ...subItem, subtask_logs: subLogs };
            });

            // Update subtask_logs field at parent task level
            const nextGlobalSubLogs = [...(t.subtask_logs || [])];
            (originTaskObj.sub_tasks || []).forEach(sub => {
              const slIdx = nextGlobalSubLogs.findIndex(sl => sl.subtask_id === sub.id && sl.todo_date === targetTodoDate);
              const payload = {
                subtask_id: sub.id,
                task_id: t.id,
                todo_date: targetTodoDate,
                status: 'SKIPPED',
                is_completed: false,
                completed_by: updaterName,
                content: sub.content || sub.name || '',
                assignee: sub.assignee || '',
                est_time: sub.est_time || 0,
                actual_time: 0
              };
              if (slIdx >= 0) {
                nextGlobalSubLogs[slIdx] = { ...nextGlobalSubLogs[slIdx], ...payload };
              } else {
                nextGlobalSubLogs.push(payload);
              }
            });

            return {
              ...t,
              task_logs: logs,
              subtask_logs: nextGlobalSubLogs,
              subtasks: nextSubtasks
            };
          }
          return t;
        });
        return { dailyTasks: nextDailyTasks };
      });

      if (openedTask && updatedIdsMap[openedTask.id] === openedTask.todo_date) {
        setOpenedTask({
          ...openedTask,
          todo_status: 'SKIPPED'
        });
      }

      const uniqueTaskIds = Array.from(new Set(Array.from(selectedTaskIds).map(vid => String(vid).split('_')[0])));
      for (const tId of uniqueTaskIds) {
        await checkAndToggleOnetimeTemplateStatus(tId);
      }

      toast.success(`Successfully skipped ${selectedTaskIds.size} tasks!`);
    } catch (err: any) {
      console.error('Error in Quick Skip batch:', err);
      toast.error(`An error occurred: ${err.message}`);
    } finally {
      setSelectedTaskIds(new Set());
      setIsQuickSkipMode(false);
      setLoading(false);
    }
  };

  // Quick Submit batch selected items to DONE
  const handleQuickSubmitBatch = async () => {
    if (selectedTaskIds.size === 0) {
      setIsQuickSubmitMode(false);
      return;
    }

    setLoading(true);
    try {
      const updaterName = activeUser?.name || profile?.name || currentUser?.email || 'System';

      // Record logs for each task
      const logsToUpsert: any[] = [];
      const subLogsToUpsert: any[] = [];

      const updatedIdsMap: Record<string, string> = {};
      const updatedTasksObjects: Record<string, VirtualTask> = {};

      for (const virtualId of selectedTaskIds) {
        const taskObj = virtualTasks.find(t => t.virtual_id === virtualId);
        if (!taskObj) continue;

        const calculatedActual = taskObj.sub_tasks?.reduce(
          (sum, s) => sum + (s.sub_status === 'Done' ? (Number(s.actual_time) || Number((s as any).actual_minutes) || s.est_time || (s as any).estimated_minutes || 0) : (s.est_time || (s as any).estimated_minutes || 0)),
          0
        ) || taskObj.est_time || 0;

        logsToUpsert.push({
          task_id: taskObj.id,
          todo_date: taskObj.todo_date,
          status: 'DONE',
          updated_by: updaterName,
          title: taskObj.title || '',
          project_name: taskObj.project_name || '',
          tag_name: taskObj.tag_name || '',
          deadline_time: taskObj.deadline_time || '17:00',
          deadline_days: taskObj.deadline_days || '',
          task_type: taskObj.task_type || 'DAILY',
          est_time: taskObj.est_time || 0,
          actual_time: calculatedActual
        });

        (taskObj.sub_tasks || []).forEach(sub => {
          const am = sub.actual_time !== undefined && sub.actual_time !== null ? sub.actual_time : ((sub as any).actual_minutes !== undefined && (sub as any).actual_minutes !== 0 ? (sub as any).actual_minutes : (sub.est_time || (sub as any).estimated_minutes || 0));
          subLogsToUpsert.push({
            subtask_id: sub.id,
            task_id: taskObj.id,
            todo_date: taskObj.todo_date,
            status: 'DONE',
            is_completed: true,
            completed_by: updaterName,
            team_name: sub.team_name || '',
            content: sub.content || sub.name || '',
            assignee: sub.assignee || '',
            est_time: sub.est_time || (sub as any).estimated_minutes || 0,
            actual_time: am || 0
          });
        });

        updatedIdsMap[taskObj.id] = taskObj.todo_date;
        updatedTasksObjects[taskObj.id] = taskObj;
      }

      // 1. Bulk Upsert Task Logs
      if (logsToUpsert.length > 0) {
        const { error: taskLogsErr } = await supabase
          .from('task_logs')
          .upsert(logsToUpsert, { onConflict: 'task_id,todo_date' });
        if (taskLogsErr) throw taskLogsErr;
      }

      // 2. Bulk Upsert Subtask Logs
      if (subLogsToUpsert.length > 0) {
        const { error: subtaskLogsErr } = await supabase
          .from('subtask_logs')
          .upsert(subLogsToUpsert, { onConflict: 'subtask_id,todo_date' });
        if (subtaskLogsErr) throw subtaskLogsErr;
      }

      // 3. Update useAppStore dailyTasks state locally
      useAppStore.setState(state => {
        const nextDailyTasks = state.dailyTasks.map(t => {
          const targetTodoDate = updatedIdsMap[t.id];
          const originTaskObj = updatedTasksObjects[t.id];
          if (targetTodoDate && originTaskObj) {
            // Task Log payload update
            const logs = [...(t.task_logs || [])];
            const existingLogIndex = logs.findIndex((l: any) => l.todo_date === targetTodoDate);
            const calculatedActual = originTaskObj.sub_tasks?.reduce(
              (sum, s) => sum + (s.sub_status === 'Done' ? (Number(s.actual_time) || Number((s as any).actual_minutes) || s.est_time || (s as any).estimated_minutes || 0) : (s.est_time || (s as any).estimated_minutes || 0)),
              0
            ) || originTaskObj.est_time || 0;

            const taskLogPayload = {
              task_id: t.id,
              todo_date: targetTodoDate,
              status: 'DONE',
              updated_by: updaterName,
              title: originTaskObj.title || '',
              project_name: originTaskObj.project_name || '',
              tag_name: originTaskObj.tag_name || '',
              deadline_time: originTaskObj.deadline_time || '17:00',
              deadline_days: originTaskObj.deadline_days || '',
              task_type: originTaskObj.task_type || 'DAILY',
              est_time: originTaskObj.est_time || 0,
              actual_time: calculatedActual
            };
            if (existingLogIndex >= 0) {
              logs[existingLogIndex] = { ...logs[existingLogIndex], ...taskLogPayload };
            } else {
              logs.push(taskLogPayload);
            }

            // Subtask Logs payload update
            const nextSubtasks = (t.subtasks || []).map((subItem: any) => {
              const subLogs = [...(subItem.subtask_logs || [])];
              const subLogIndex = subLogs.findIndex((sl: any) => sl.todo_date === targetTodoDate);
              const originSub = originTaskObj.sub_tasks?.find(s => s.id === subItem.id);
              const am = originSub ? (originSub.actual_time !== undefined && originSub.actual_time !== null ? originSub.actual_time : ((originSub as any).actual_minutes !== undefined && (originSub as any).actual_minutes !== 0 ? (originSub as any).actual_minutes : (originSub.est_time || (originSub as any).estimated_minutes || 0))) : (subItem.est_time || 0);

              const subLogPayload = {
                subtask_id: subItem.id,
                task_id: t.id,
                todo_date: targetTodoDate,
                status: 'DONE',
                is_completed: true,
                completed_by: updaterName,
                content: subItem.content || subItem.name || '',
                assignee: subItem.assignee || '',
                est_time: subItem.est_time || 0,
                actual_time: am || 0
              };
              if (subLogIndex >= 0) {
                subLogs[subLogIndex] = { ...subLogs[subLogIndex], ...subLogPayload };
              } else {
                subLogs.push(subLogPayload);
              }
              return { ...subItem, subtask_logs: subLogs };
            });

            // Update subtask_logs field at parent task level
            const nextGlobalSubLogs = [...(t.subtask_logs || [])];
            (originTaskObj.sub_tasks || []).forEach(sub => {
              const slIdx = nextGlobalSubLogs.findIndex(sl => sl.subtask_id === sub.id && sl.todo_date === targetTodoDate);
              const am = sub.actual_time !== undefined && sub.actual_time !== null ? sub.actual_time : ((sub as any).actual_minutes !== undefined && (sub as any).actual_minutes !== 0 ? (sub as any).actual_minutes : (sub.est_time || (sub as any).estimated_minutes || 0));
              const payload = {
                subtask_id: sub.id,
                task_id: t.id,
                todo_date: targetTodoDate,
                status: 'DONE',
                is_completed: true,
                completed_by: updaterName,
                content: sub.content || sub.name || '',
                assignee: sub.assignee || '',
                est_time: sub.est_time || 0,
                actual_time: am || 0
              };
              if (slIdx >= 0) {
                nextGlobalSubLogs[slIdx] = { ...nextGlobalSubLogs[slIdx], ...payload };
              } else {
                nextGlobalSubLogs.push(payload);
              }
            });

            return {
              ...t,
              task_logs: logs,
              subtask_logs: nextGlobalSubLogs,
              subtasks: nextSubtasks
            };
          }
          return t;
        });
        return { dailyTasks: nextDailyTasks };
      });

      if (openedTask && updatedIdsMap[openedTask.id] === openedTask.todo_date) {
        setOpenedTask({
          ...openedTask,
          todo_status: 'DONE'
        });
      }

      const uniqueTaskIds = Array.from(new Set(Array.from(selectedTaskIds).map(vid => String(vid).split('_')[0])));
      for (const tId of uniqueTaskIds) {
        await checkAndToggleOnetimeTemplateStatus(tId);
      }

      toast.success(`Successfully completed ${selectedTaskIds.size} tasks!`);
    } catch (err: any) {
      console.error('Error in Quick Submit batch:', err);
      toast.error(`An error occurred: ${err.message}`);
    } finally {
      setSelectedTaskIds(new Set());
      setIsQuickSubmitMode(false);
      setLoading(false);
    }
  };

  // Parse details for Slider drawer component
  const openedTaskParsedMeta = useMemo(() => {
    if (!openedTask) return null;
    const meta = parseTaskDescription(openedTask.description);
    return {
      project_name: openedTask.project_name,
      team_name: openedTask.team_name,
      tag_name: openedTask.tag_name,
      deadline_days: openedTask.deadline_days,
      note: meta.note || ''
    };
  }, [openedTask]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white overflow-x-auto relative font-sans">
      
      {/* 1. Header with Filters of Checklist To-do */}
      <div className="px-6 h-[54px] border-b border-slate-100 bg-white shrink-0 flex items-center justify-between gap-4 flex-nowrap overflow-visible relative z-[40] min-w-[1350px] w-full select-none py-0">
        <div className="flex items-center gap-2 shrink-0 flex-nowrap">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by task ID/name..." 
              value={searchQuery}
              className="pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs w-52 focus:outline-none focus:border-slate-400 font-medium text-slate-700 h-8 shadow-sm"
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Assignees/Personnel filter */}
          <SearchableFilterSelect
            value={filterAssignee}
            onChange={(val) => {
              setFilterAssignee(val);
              setPage(1);
              if (val) {
                const companionTeams = userToTeamsMap[val] || [];
                if (companionTeams.length > 0) {
                  const hasSelectionMatch = companionTeams.some(t => selectedTeams.includes(t));
                  if (!hasSelectionMatch) {
                    setFilterTeam(companionTeams[0]);
                  }
                }
              } else {
                setFilterTeam('');
              }
            }}
            defaultOptionLabel="All Assignees"
            options={assigneesOptions.map(person => ({ value: person, label: person }))}
            className="h-8 w-[190px] min-w-[190px] max-w-[190px]"
          />

          {/* Project filter */}
          <FilterSelect
            value={filterProject}
            onChange={(val) => {
              setFilterProject(val);
              setPage(1);
            }}
            defaultOptionLabel="Projects"
            options={projectsOptions.map(proj => ({ value: proj, label: proj }))}
            className="h-8 w-[190px] min-w-[190px] max-w-[190px]"
          />

          {/* Tag filter */}
          <FilterSelect
            value={filterTag}
            onChange={(val) => {
              setFilterTag(val);
              setPage(1);
            }}
            defaultOptionLabel="Tags"
            options={tagsOptions.map(tag => ({ value: tag, label: tag }))}
            className="h-8 w-[120px] min-w-[120px] max-w-[120px]"
          />

          {/* Team filter */}
          <MultiTeamFilterSelect
            value={filterTeam}
            onChange={(val) => {
              setFilterTeam(val);
              setPage(1);
              if (val) {
                const nextSelected = val.split(',').filter(Boolean);
                if (filterAssignee && nextSelected.length > 0) {
                  const companionTeams = userToTeamsMap[filterAssignee] || [];
                  const hasMatch = companionTeams.some(t => nextSelected.includes(t));
                  if (!hasMatch) {
                    setFilterAssignee('');
                  }
                }
              }
            }}
            defaultOptionLabel="Teams"
            options={teamsOptions.map(tm => ({ value: tm, label: tm }))}
            className="h-8 w-[120px] min-w-[120px] max-w-[120px]"
          />

          {/* Task Type Filter */}
          <MultiTeamFilterSelect
            value={filterTaskType}
            onChange={(val) => {
              setFilterTaskType(val);
              setPage(1);
            }}
            defaultOptionLabel="Type"
            options={[
              { value: 'DAILY', label: 'Daily' },
              { value: 'WEEKLY', label: 'Weekly' },
              { value: 'MONTHLY', label: 'Monthly' },
              { value: 'ONETIME', label: 'Onetime' }
            ]}
            className="h-8 w-[100px] min-w-[100px] max-w-[100px]"
          />

          {/* Status checklist filter (NEW, DONE, SKIPPED) */}
          <FilterSelect
            value={filterTodoStatus}
            onChange={(val) => {
              setFilterTodoStatus(val);
              setPage(1);
            }}
            defaultOptionLabel="Status"
            options={[
              { value: 'NEW', label: 'New' },
              { value: 'DONE', label: 'Done' },
              { value: 'SKIPPED', label: 'Skipped' }
            ]}
            className="h-8 w-[120px] min-w-[120px] max-w-[120px]"
          />

          {/* Interactive Date Range custom box mimicking mockup */}
          <DateRangePicker 
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              setStartDate(start || getTodayDateString());
              setEndDate(end || getTodayDateString());
              setPage(1);
            }}
            className="h-8"
          />

          {/* Reset Filters */}
          {!isDefaultFilters && (
            <button 
              onClick={() => {
                setSearchQuery('');
                setFilterAssignee(activeUser?.name || '');
                setFilterTag('');
                setFilterProject('');
                setFilterTeam('');
                setFilterTodoStatus('NEW');
                setFilterTaskType('');
                setStartDate(getTodayDateString());
                setEndDate(getTodayDateString());
                setPage(1);
              }}
              className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
              title="Reset filters"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>

        {/* Main interactive triggers */}
        <div className="flex items-center gap-2 shrink-0">


          {!isUser && (
            <>
              {isQuickSubmitMode ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button 
                    onClick={handleQuickSubmitBatch}
                    className="h-8 px-2 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 rounded-md transition-all font-semibold text-xs whitespace-nowrap shadow-sm"
                    title="Execute batch completion"
                  >
                    <span>Q-Done ({selectedTaskIds.size})</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsQuickSubmitMode(false);
                      setSelectedTaskIds(new Set());
                    }}
                    className="w-8 h-8 flex items-center justify-center border border-slate-200 bg-white hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
                    title="Cancel Q-Done"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => {
                    setIsQuickSkipMode(false);
                    setIsQuickSubmitMode(true);
                    setSelectedTaskIds(new Set());
                  }}
                  className="h-8 px-2 flex items-center justify-center border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-md transition-colors shadow-sm font-semibold text-xs whitespace-nowrap"
                  title="Quick Done (Master/Admin only - batch completes tasks & subtasks)"
                >
                  <span>Q-Done</span>
                </button>
              )}

              {isQuickSkipMode ? (
                <div className="flex items-center gap-1 shrink-0">
                  <button 
                    onClick={handleQuickSkipBatch}
                    className="h-8 px-2 flex items-center justify-center bg-amber-600 hover:bg-amber-700 text-white border border-amber-600 rounded-md transition-all font-semibold text-xs whitespace-nowrap shadow-sm"
                    title="Execute batch skip"
                  >
                    <span>Q-Skip ({selectedTaskIds.size})</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsQuickSkipMode(false);
                      setSelectedTaskIds(new Set());
                    }}
                    className="w-8 h-8 flex items-center justify-center border border-slate-200 bg-white hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
                    title="Cancel Q-Skip"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => {
                    setIsQuickSubmitMode(false);
                    setIsQuickSkipMode(true);
                    setSelectedTaskIds(new Set());
                  }}
                  className="h-8 px-2 flex items-center justify-center border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-md transition-colors shadow-sm font-semibold text-xs whitespace-nowrap"
                  title="Quick Skip (Master/Admin only - batch skips tasks)"
                >
                  <span>Q-Skip</span>
                </button>
              )}
            </>
          )}

          <button 
            onClick={handleExportCsv}
            disabled={filteredTasks.length === 0}
            className="h-8 px-2 flex items-center gap-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-md transition-colors disabled:opacity-40 font-semibold text-xs whitespace-nowrap shadow-sm"
            title="Export current checklist as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* 2. Main Daily Checklist tasks list Table context */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white min-h-[400px] min-w-[1350px] w-full">
        {loading ? (
          <div className="h-full w-full flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-slate-400 font-medium animate-pulse">Loading checklist...</p>
          </div>
        ) : paginatedTasks.length > 0 ? (
          <>
            {/* Gmail-style select-all banner */}
            {(isQuickSkipMode || isQuickSubmitMode) && selectedTaskIds.size >= paginatedTasks.length && filteredTasks.length > paginatedTasks.length && (
              <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-2 text-center text-xs text-indigo-700 font-medium sticky left-0 right-0 z-30">
                {!isAllPagesSelected ? (
                  <span>
                    Tất cả <strong>{paginatedTasks.length}</strong> task trên trang này đã được chọn.{" "}
                    <button 
                      type="button"
                      onClick={() => {
                        setSelectedTaskIds(new Set(filteredTasks.map(t => t.virtual_id)));
                        setIsAllPagesSelected(true);
                      }}
                      className="underline text-indigo-800 hover:text-indigo-950 font-bold ml-1 cursor-pointer transition-colors"
                    >
                      Chọn tất cả {filteredTasks.length} task trong danh sách
                    </button>
                  </span>
                ) : (
                  <span>
                    Đã chọn tất cả <strong>{filteredTasks.length}</strong> task trong danh sách.{" "}
                    <button 
                      type="button"
                      onClick={() => {
                        setSelectedTaskIds(new Set(paginatedTasks.map(t => t.virtual_id)));
                        setIsAllPagesSelected(false);
                      }}
                      className="underline text-indigo-800 hover:text-indigo-950 font-bold ml-1 cursor-pointer transition-colors"
                    >
                      Xóa lựa chọn (chỉ giữ {paginatedTasks.length} task của trang hiện tại)
                    </button>
                  </span>
                )}
              </div>
            )}

            <table className="w-full text-left border-collapse table-fixed select-none min-w-[1350px]">
              <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-20">
                <tr className="h-8">
                  {(isQuickSkipMode || isQuickSubmitMode) && (
                    <th className="w-[4%] px-3 text-center bg-slate-100">
                      <button onClick={handleToggleSelectAll} className="text-slate-400 hover:text-indigo-600 transition-colors">
                        {(selectedTaskIds.size >= paginatedTasks.length && selectedTaskIds.size > 0) ? (
                          <CheckSquare size={14} className="text-indigo-600 mx-auto" />
                        ) : (
                          <Square size={14} className="mx-auto" />
                        )}
                      </button>
                    </th>
                  )}
                <th className={`${(isQuickSkipMode || isQuickSubmitMode) ? 'w-[4%]' : 'w-[5%]'} px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100`}>Id</th>
                <th className={`${(isQuickSkipMode || isQuickSubmitMode) ? 'w-[15%]' : 'w-[18%]'} px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100`}>Task Name</th>
                <th className="w-[11%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Project</th>
                <th className="w-[7%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Tag</th>
                <th className="w-[6%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Team</th>
                <th className="w-[6%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center bg-slate-100">Type</th>
                <th className="w-[12%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Type Detail</th>
                <th className="w-[12%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Deadline</th>
                <th className="w-[12%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center bg-slate-100">Time</th>
                <th className="w-[5%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center bg-slate-100">Status</th>
                <th className="w-[6%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center bg-slate-100">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y premium-divide">
              {paginatedTasks.map((task) => {
                const isChecked = selectedTaskIds.has(task.virtual_id);
                return (
                  <tr 
                    key={task.virtual_id} 
                    className="h-[46px] hover:bg-slate-50/50 transition-colors group cursor-pointer"
                    onClick={() => {
                      if (isQuickSkipMode || isQuickSubmitMode) {
                        handleToggleSelectRow(task.virtual_id);
                      } else {
                        handleOpenTask(task);
                      }
                    }}
                  >
                    {/* Checkbox selector item */}
                    {(isQuickSkipMode || isQuickSubmitMode) && (
                      <td className="px-3 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={() => handleToggleSelectRow(task.virtual_id)}
                          className="text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                          {isChecked ? (
                            <CheckSquare size={14} className="text-indigo-600 mx-auto" />
                          ) : (
                            <Square size={14} className="mx-auto" />
                          )}
                        </button>
                      </td>
                    )}

                    {/* ID */}
                    <td className="px-3 py-1.5">
                      <span className="font-mono text-xs text-slate-400 font-medium">
                        {getDisplayId(task)}
                      </span>
                    </td>

                    {/* Task Name */}
                    <td className="px-3 py-1.5 overflow-hidden">
                      <span className="font-medium text-slate-700 text-xs truncate block" title={`${task.title || ''}${task.origin_repeat_day ? `（Ngày ${task.origin_repeat_day}）` : ''}`}>
                        {task.title}{task.origin_repeat_day ? <span className="text-slate-400 font-normal ml-1">（Ngày {task.origin_repeat_day}）</span> : ''}
                      </span>
                    </td>

                    {/* Project */}
                    <td className="px-3 py-1.5 overflow-hidden" title={task.project_name || ''}>
                      <span className="text-slate-600 text-xs truncate block font-normal">
                        {task.project_name}
                      </span>
                    </td>

                    {/* Tag label */}
                    <td className="px-3 py-1.5 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-block bg-slate-50 border border-slate-100 px-2 py-0.5 rounded text-xs text-slate-600 truncate max-w-full font-medium">
                        {task.tag_name || '数値報告'}
                      </span>
                    </td>

                    {/* Team */}
                    <td className="px-3 py-1.5 overflow-hidden">
                      <span 
                        className="text-slate-500 text-xs truncate block font-normal" 
                        title={getTaskTeams(task.sub_tasks, task.team_name).allTeams.join(', ') || 'No Team'}
                      >
                        {getTaskTeams(task.sub_tasks, task.team_name).display}
                      </span>
                    </td>

                    {/* Frequency Badge */}
                    <td className="px-3 py-1.5 text-center">
                      {(() => {
                        const typeUpper = (task.task_type || 'DAILY').toUpperCase();
                        let badgeClass = 'bg-slate-50 border-slate-100 text-slate-600';
                        if (typeUpper === 'DAILY') badgeClass = 'bg-blue-50 border-blue-100 text-blue-600';
                        else if (typeUpper === 'WEEKLY') badgeClass = 'bg-amber-50 border-amber-100 text-amber-700';
                        else if (typeUpper === 'MONTHLY') badgeClass = 'bg-emerald-50 border-emerald-100 text-emerald-700';
                        else if (typeUpper === 'ONETIME') badgeClass = 'bg-rose-50 border-rose-100 text-rose-700';
                        
                        return (
                          <span className={`inline-block border px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${badgeClass}`}>
                            {typeUpper}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Type Detail */}
                    <td className="px-3 py-1.5 overflow-hidden">
                      <span className="text-slate-600 text-xs truncate block font-normal" title={formatDisplayDate(task.deadline_days || '')}>
                        {formatDisplayDate(task.deadline_days || '')}
                      </span>
                    </td>

                    {/* Deadline hours and days limit representation */}
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <Clock size={12} className="text-slate-400 shrink-0" />
                        <span className="truncate">
                          {formatDisplayDate(task.todo_date)} ({task.deadline_time || '08:30'})
                        </span>
                      </div>
                    </td>

                    {/* TIME (EST/ACT) columns */}
                    <td className="px-3 py-1.5 text-center">
                      <span className="font-mono text-xs text-slate-600">
                        <span className="text-indigo-600 font-medium">{task.est_time || 0}m</span> / <span className="text-emerald-600 font-medium">{task.actual_time || 0}m</span>
                      </span>
                    </td>

                    {/* To-do list internal status pill with standard minimalistic dot */}
                    <td className="px-3 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1.5 justify-center">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          task.todo_status === 'DONE' 
                            ? 'bg-emerald-500' 
                            : task.todo_status === 'SKIPPED'
                              ? 'bg-amber-500'
                              : 'bg-indigo-500'
                        }`} />
                        <span className={`text-xs font-semibold ${
                          task.todo_status === 'DONE' 
                            ? 'text-emerald-600' 
                            : task.todo_status === 'SKIPPED'
                              ? 'text-amber-600'
                              : 'text-indigo-600'
                        }`}>
                          {task.todo_status === 'DONE' ? 'Done' : task.todo_status === 'SKIPPED' ? 'Skipped' : 'New'}
                        </span>
                      </div>
                    </td>

                    {/* Direct action triggers */}
                    <td className="px-3 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const hasNewSubTask = (task.sub_tasks || []).some(sub => (sub.sub_status || 'New') === 'New');
                        if (task.todo_status === 'NEW') {
                          return (
                            <button
                              onClick={() => handleDirectSubmit(task)}
                              disabled={hasNewSubTask}
                              className={`px-2.5 h-6 transition-all text-white rounded-md text-xs font-medium ${
                                hasNewSubTask
                                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                  : 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                              }`}
                              title={hasNewSubTask ? "Please update all sub-tasks to Done or Skipped before submitting!" : undefined}
                            >
                              Submit
                            </button>
                          );
                        } else {
                          return (
                            <button
                              disabled={isUser}
                              onClick={() => handleResetTask(task)}
                              className={`px-2.5 h-6 rounded-md text-xs font-medium transition-colors border shadow-sm ${
                                isUser
                                  ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed opacity-60'
                                  : 'bg-white hover:bg-slate-50 text-slate-500 border-slate-200 cursor-pointer'
                              }`}
                              title={isUser ? "You do not have permission to reset tasks!" : undefined}
                            >
                              Reset
                            </button>
                          );
                        }
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        ) : (
          <div className="py-24 flex flex-col items-center justify-center text-center">
            <div className="p-4 bg-slate-50 rounded-full mb-3 text-slate-300">
              <AlertCircle size={36} />
            </div>
            <h4 className="text-slate-800 font-bold text-sm">No Checklist Tasks Available</h4>
            <p className="text-slate-400 text-xs mt-1 max-w-xs leading-relaxed">
              No tasks found matching your filters or there are no active tasks (template status ON).
            </p>
          </div>
        )}
      </div>

      {/* 3. Footer Pagination standard matching list mockup */}
      <div className="px-6 h-8 flex items-center justify-between border-t border-slate-100 bg-white shrink-0 selection:bg-none min-w-[1350px] w-full py-0">
        <span className="text-[11px] font-semibold text-slate-400 font-mono">
          Total: {totalCount} tasks | {totalSubtasksCount} subtasks
        </span>
        
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1">
            <button 
              disabled={page === 1} 
              onClick={() => setPage(p => p - 1)} 
              className="w-6 h-6 flex items-center justify-center text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all cursor-pointer"
            >
              <ChevronLeft size={12} />
            </button>
            <div className="flex gap-1 mx-2">
              {getPaginationItems().map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => typeof item === 'number' && setPage(item)}
                  disabled={typeof item !== 'number'}
                  className={`w-6 h-6 flex items-center justify-center rounded-md text-[11px] font-bold transition-all ${
                    page === item 
                      ? "bg-indigo-600 text-white shadow-sm cursor-default" 
                      : typeof item === 'number'
                        ? "text-slate-500 hover:bg-slate-50 hover:text-slate-700 border border-slate-200/60 bg-white cursor-pointer"
                        : "text-slate-300 cursor-default"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <button 
              disabled={page === totalPages} 
              onClick={() => setPage(p => p + 1)} 
              className="w-6 h-6 flex items-center justify-center text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all cursor-pointer"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        )}
        <div className="w-20 hidden md:block"></div>
      </div>

      {/* 4. SIDE DRAWER: Detailed progress check side drawer */}
      {openedTask && openedTaskParsedMeta && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity cursor-pointer animate-in fade-in duration-200" 
            onClick={handleCloseDrawer}
          />

          {/* Drawer Body container */}
          <div className="relative w-full max-w-[450px] bg-white h-full shadow-2xl flex flex-col z-10 border-l border-slate-100 animate-in slide-in-from-right duration-300">
            {/* Header info */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 leading-snug">{openedTask.title}</h3>
                <span className="text-xs font-mono text-slate-400 mt-0.5 block">Id: {getDisplayId(openedTask)}</span>
              </div>
              <button 
                onClick={handleCloseDrawer}
                className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* Tags info grid block */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-3 text-xs border border-slate-100">
                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium block">Project</span>
                  <span className="text-slate-700 block text-xs font-semibold truncate" title={openedTaskParsedMeta.project_name || ''}>
                    {openedTaskParsedMeta.project_name || 'N/A'}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium block">Tag</span>
                  <span className="text-slate-700 block text-xs truncate" title={openedTaskParsedMeta.tag_name || ''}>
                    {openedTaskParsedMeta.tag_name || 'N/A'}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium block">Team</span>
                  <span className="text-slate-700 block text-xs truncate" title={getTaskTeams(openedTask.sub_tasks, openedTaskParsedMeta.team_name).display}>
                    {getTaskTeams(openedTask.sub_tasks, openedTaskParsedMeta.team_name).display}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium block">Frequency mode</span>
                  <span className="text-slate-700 block text-xs font-semibold">
                    {openedTask.task_type || 'DAILY'}
                  </span>
                  {openedTaskParsedMeta.deadline_days && (
                    <span className="block text-[11px] text-slate-500 font-mono mt-0.5 leading-normal break-all">
                      ({formatDisplayDate(openedTaskParsedMeta.deadline_days)})
                    </span>
                  )}
                </div>
              </div>

              {/* Note Display Section */}
              <div className="space-y-1 bg-slate-50 border border-slate-100/80 rounded-lg p-3 text-xs note-section-wrapper">
                <span className="text-slate-400 font-bold block uppercase tracking-wider text-[10px]">Note</span>
                <div className="mt-1">
                  {(() => {
                    const noteStr = openedTaskParsedMeta.note || '';
                    if (!noteStr) return <span className="text-slate-400 italic">No note configured</span>;
                    const trimmed = noteStr.trim();
                    const looksLikeUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://') || /^(www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed);
                    if (looksLikeUrl) {
                      const href = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
                      return (
                        <a 
                          href={href} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-indigo-600 hover:text-indigo-800 hover:underline font-semibold break-all inline-flex items-center gap-1"
                          id="todo_note_url_link"
                        >
                          <span>{trimmed}</span>
                        </a>
                      );
                    }
                    return <span className="text-slate-700 font-medium break-words note-text-content">{trimmed}</span>;
                  })()}
                </div>
              </div>

              {/* TASK STATUS Section showing status indicator */}
              <div className="space-y-2 pb-3 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-500 block">Task status</span>
                
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-120">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      openedTask.todo_status === 'DONE' 
                        ? 'bg-emerald-500' 
                        : openedTask.todo_status === 'SKIPPED'
                          ? 'bg-slate-400'
                          : 'bg-blue-500'
                    }`} />
                    <span className="text-xs text-slate-600">
                      {openedTask.todo_status === 'DONE' ? 'Done' : openedTask.todo_status === 'SKIPPED' ? 'Skipped' : 'New'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Dynamic subtasks detailed adjustments inside the slider drawer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pb-0.5">
                  <h3 className="text-xs font-semibold text-slate-500">Sub-tasks management</h3>
                  <div className="text-xs font-medium text-slate-500 font-mono flex items-center gap-2">
                    <span>Est: {openedTask.est_time || 0}m</span>
                    <span>•</span>
                    <span className="text-emerald-600">Act: {openedTask.actual_time || 0}m</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {openedTask.sub_tasks && openedTask.sub_tasks.length > 0 ? (
                    openedTask.sub_tasks.map((sub, index) => {
                      const currentSubStatus = sub.sub_status || 'New';
                      return (
                        <div 
                          key={sub.id || index} 
                          className="border border-slate-100 rounded-lg p-3 bg-white flex flex-col justify-between gap-2 shadow-xs hover:border-blue-100 transition-all animate-in fade-in"
                        >
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <span className="text-slate-800 text-xs font-medium leading-normal">{sub.content}</span>
                            <span className="text-xs bg-slate-50 text-slate-500 border border-slate-100 rounded px-1.5 py-0.5 shrink-0 ml-auto font-medium">
                              {sub.assignee}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 pt-1.5 border-t border-slate-50 flex-wrap sm:flex-nowrap justify-between">
                            {/* ACTUAL: [ x ] MIN field */}
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                              <span>Actual:</span>
                              <div className="relative flex items-center">
                                <input 
                                  type="number"
                                  min={0}
                                  placeholder={String(sub.est_time || 0)}
                                  value={(sub.actual_time !== undefined && sub.actual_time !== null && (sub.sub_status !== 'New' || sub.actual_time !== 0)) ? sub.actual_time : ''}
                                  className="w-12 h-6 px-1 text-center bg-slate-50 border border-slate-200 rounded font-medium text-slate-800 focus:outline-none focus:bg-white text-xs font-mono"
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    let parsedVal = val === '' ? undefined : Math.max(0, parseInt(val) || 0);
                                    if (parsedVal !== undefined && parsedVal > 10000) {
                                      parsedVal = 10000;
                                      toast.warning('Max actual time for subtask is 10000 minutes');
                                    }
                                    handleUpdateSubtaskValueLocal(sub.id, { 
                                      actual_time: parsedVal 
                                    });
                                  }}
                                />
                              </div>
                              <span>min</span>
                            </div>

                            {/* SELECT BOX sub-task state selection (Done, New, Skipped) */}
                            <select
                              value={currentSubStatus}
                              className="h-6 px-1.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 focus:outline-none cursor-pointer"
                              onChange={(e) => {
                                const nextVal = e.target.value as 'New' | 'Done' | 'Skipped';
                                handleUpdateSubtaskValueLocal(sub.id, { 
                                  sub_status: nextVal,
                                  // Auto set mins if setting to Done
                                  ...(nextVal === 'Done' && (sub.actual_time === 0 || sub.actual_time === undefined) ? { actual_time: sub.est_time } : {}),
                                  ...(nextVal === 'Skipped' ? { actual_time: 0 } : {})
                                });
                              }}
                            >
                              <option value="New">New</option>
                              <option value="Done">Done</option>
                              <option value="Skipped">Skipped</option>
                            </select>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 border border-dashed border-slate-200 select-none text-center rounded-xl text-slate-400 text-xs bg-slate-50/40">
                      No sub-tasks defined for this template.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Submit template button at bottom of Side Drawer */}
            <div className="p-4 border-t border-slate-100 shrink-0">
              {(() => {
                const isOneTime = (openedTask.task_type || '').toUpperCase() === 'ONETIME';
                const hasNewSubTask = (openedTask.sub_tasks || []).some(sub => (sub.sub_status || 'New') === 'New');
                const isResetDisabled = (!isOneTime && !openedTask.is_active) || isUser;
                const resetTitle = isUser
                  ? "You do not have permission to reset tasks!"
                  : (!isOneTime && !openedTask.is_active)
                    ? "Cannot reset task when template is offline in Task Manager!"
                    : undefined;
                const resetLabel = isUser
                  ? "Reset disabled (Role: User)"
                  : (!isOneTime && !openedTask.is_active)
                    ? "Reset draft (Template Offline)"
                    : "Reset task";

                if (openedTask.todo_status === 'NEW') {
                  return (
                    <button 
                      onClick={() => handleDirectSubmit(openedTask)}
                      disabled={hasNewSubTask}
                      className={`w-full h-8 rounded text-xs font-semibold flex items-center justify-center gap-2 shadow-sm pointer-events-auto transition-all ${
                        hasNewSubTask
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed border-slate-300 opacity-70'
                          : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                      }`}
                      title={hasNewSubTask ? "Please update all sub-tasks to Done or Skipped (do not leave as New) before submitting!" : undefined}
                    >
                      <Check size={14} />
                      <span>Submit task</span>
                    </button>
                  );
                } else {
                  return (
                    <button 
                      onClick={() => handleResetTask(openedTask)}
                      disabled={isResetDisabled}
                      className={`w-full h-8 rounded text-xs font-semibold flex items-center justify-center gap-2 shadow-sm pointer-events-auto transition-all ${
                        isResetDisabled
                          ? 'bg-slate-200 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                          : 'bg-slate-600 hover:bg-slate-700 text-white cursor-pointer'
                      }`}
                      title={resetTitle}
                    >
                      <RotateCcw size={14} />
                      <span>{resetLabel}</span>
                    </button>
                  );
                }
              })()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default TaskList;
