import { create } from 'zustand';
import { supabase } from './lib/supabase';

let hasUpdatedAtColumn = true;

export type UserRole = 'master' | 'admin' | 'user';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE';
  user_teams?: { team_id: string }[];
}

export interface Project {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
}

export interface TaskLog {
  id: string;
  task_id: string;
  todo_date: string; // YYYY-MM-DD
  status: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'SUBMITTED' | 'SKIPPED';
}

export interface SubtaskLog {
  id: string;
  subtask_id: string;
  task_id: string;
  todo_date: string; // YYYY-MM-DD
  is_completed: boolean;
  status?: string;
  completed_by?: string;
  team_name?: string; // Cột lưu trữ thông tin Team
}

export interface Subtask {
  id: string;
  task_id?: string;
  name?: string;                     // Giữ name? cho tương thích ngược với UI
  content: string;                    // Cột mới template con subtasks
  assignee: string;
  est_time?: number;                 // Lưu số phút dự kiến
  actual_time?: number;              // Lưu số phút thực tế
  status?: 'NEW' | 'IN_PROGRESS' | 'DONE'; // Thêm status thay vì chỉ is_completed
  is_completed?: boolean;
  subtask_logs?: SubtaskLog[];        // Chứa dữ liệu nhật ký subtask ngày
  team_name?: string;                 // Cột lưu trữ thông tin Team trực tiếp
}

export interface Task {
  id: string;
  task_name: string;                  // Giữ nguyên cho tương thích ngược
  title?: string;                    // Cột mới ở bảng tasks mới
  description?: string | null;       // Cột mới (chỉ còn note/mô tả thuần)
  project_name?: string;             // Cột TEXT mới thay thế project_id relation
  tag_name?: string;                 // Cột TEXT mới thay thế tag_id relation
  type: 'DAILY' | 'WEEKLY' | 'ONCE' | 'MONTHLY' | 'ONETIME'; // Kiểu cũ/mới của task
  task_type?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONETIME'; // Trường mới
  
  // Các field thời gian mới theo Phase 2 (Migration 1)
  deadline_time?: string | null;     // VD: "08:30" hoặc "17:00:00"
  deadline_days?: string | null;     // Cột độc lập chứa ngày lặp lại dưới dạng TEXT
  est_time: number;                  // Lưu số phút dự kiến
  actual_time: number;               // Lưu số phút thực tế

  status: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'SUBMITTED';
  subtasks: Subtask[];
  created_at: string;
  updated_at?: string;

  task_logs?: TaskLog[];             // Chứa dữ liệu nhật ký task ngày (Resource Embedding)
}

export interface TaskMetadata {
  project_name: string;
  team_name: string;
  tag_name: string;
  note: string;
}

export interface AuditLog {
  id: string;
  action: string;
  description: string;
  user_id?: string;
  user_name: string;
  metadata?: any;       // Lưu log dạng JSONB
  created_at: string;   // Thay thế cho field 'time' cũ
}

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export interface AppState {
  activeTab: 'TO-DO LIST' | 'TASK MANAGER' | 'DASHBOARD' | 'APPROVE TASK' | 'AUDIT LOG' | 'SETTINGS';
  setActiveTab: (tab: AppState['activeTab']) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: AppState['theme']) => void;
  refreshKey: number;
  triggerRefresh: () => void;
  isSidebarOpen: boolean;
  setSidebarOpen: (isOpen: boolean) => void;
  confirmDialog: ConfirmConfig | null;
  showConfirm: (config: ConfirmConfig) => void;
  hideConfirm: () => void;

  // Global cache metadata and tasks
  projectsList: string[];
  teamsList: string[];
  tagsList: string[];
  assigneesList: string[];
  usersFullList: any[];
  projectsFullList: any[];
  teamsFullList: any[];
  tagsFullList: any[];
  metadataLoaded: boolean;
  metadataLoading: boolean;
  tasks: any[];
  tasksLoaded: boolean;
  tasksLoading: boolean;
  approveTasks: any[];
  approveTasksLoaded: boolean;
  approveTasksLoading: boolean;

  // State mới cho bước refactor RDBMS
  dailyTasks: any[];
  dailyTasksLoaded: boolean;
  dailyTasksLoading: boolean;

  // Date tracking for daily tasks
  startDate: string;
  endDate: string;
  setDates: (start: string, end: string) => void;

  // Active tasks templates cache to optimize fetchDailyTasks
  activeTasksTemplates: any[];
  activeTasksTemplatesLoaded: boolean;

  fetchMetadata: (force?: boolean) => Promise<void>;
  fetchTasks: (force?: boolean) => Promise<void>;
  fetchApproveTasks: (force?: boolean) => Promise<void>;
  fetchDailyTasks: (startDateString: string, endDateString?: string, isSilent?: boolean, forceTemplates?: boolean) => Promise<void>;
  setTasks: (tasks: any[] | ((prev: any[]) => any[])) => void;
  lastSyncTime: string;
  setLastSyncTime: (time: string) => void;
  syncDeltaUpdates: () => Promise<boolean>;
}

// Helper to parse description
const getTodayDateStringInternal = (): string => {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 10);
  return localISOTime;
};

const parseTaskDescriptionLocal = (rawDescription: any) => {
  const defaultMeta = {
    project_name: '',
    team_name: '',
    tag_name: '',
    note: '',
    versions: [] as any[]
  };

  if (!rawDescription) return defaultMeta;

  if (typeof rawDescription === 'object') {
    return {
      project_name: rawDescription.project_name || '',
      team_name: rawDescription.team_name || '',
      tag_name: rawDescription.tag_name || '',
      note: rawDescription.note || rawDescription.description || '',
      versions: rawDescription.versions || []
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
          note: parsed.note || parsed.description || '',
          versions: parsed.versions || []
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

// Store quản lý UI và cache dữ liệu toàn cục để tối ưu hóa UI/UX
export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'TO-DO LIST',
  setActiveTab: (tab) => set((state) => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return {
      activeTab: tab,
      isSidebarOpen: isMobile ? false : state.isSidebarOpen,
    };
  }),
  theme: (localStorage.getItem('app-theme') as 'light' | 'dark') || 'light',
  setTheme: (theme) => {
    localStorage.setItem('app-theme', theme);
    set({ theme });
  },
  refreshKey: 0,
  triggerRefresh: () => {
    set((state) => ({ refreshKey: state.refreshKey + 1 }));
    get().fetchTasks(true);
    get().fetchMetadata(true);
    get().fetchApproveTasks(true);
  },
  isSidebarOpen: typeof window !== 'undefined'
    ? (window.innerWidth >= 768 ? localStorage.getItem('sidebar-open') !== 'false' : false)
    : false,
  setSidebarOpen: (isOpen) => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (!isMobile) {
      localStorage.setItem('sidebar-open', isOpen ? 'true' : 'false');
    }
    set({ isSidebarOpen: isOpen });
  },
  confirmDialog: null,
  showConfirm: (config) => set({ confirmDialog: config }),
  hideConfirm: () => set({ confirmDialog: null }),

  // Initial global state
  projectsList: [],
  teamsList: [],
  tagsList: [],
  assigneesList: [],
  usersFullList: [],
  projectsFullList: [],
  teamsFullList: [],
  tagsFullList: [],
  metadataLoaded: false,
  metadataLoading: false,
  tasks: [],
  tasksLoaded: false,
  tasksLoading: false,
  approveTasks: [],
  approveTasksLoaded: false,
  approveTasksLoading: false,

  // State mới cho bước refactor RDBMS
  dailyTasks: [],
  dailyTasksLoaded: false,
  dailyTasksLoading: false,

  // Active tasks templates cache to optimize fetchDailyTasks
  activeTasksTemplates: [],
  activeTasksTemplatesLoaded: false,

  // Date tracking for daily tasks
  startDate: typeof window !== 'undefined' ? (sessionStorage.getItem('todo_startDate') || getTodayDateStringInternal()) : '',
  endDate: typeof window !== 'undefined' ? (sessionStorage.getItem('todo_endDate') || getTodayDateStringInternal()) : '',
  lastSyncTime: new Date().toISOString(),
  setDates: (start: string, end: string) => set({ startDate: start, endDate: end }),

  fetchMetadata: async (force = false) => {
    if (!force && get().metadataLoading) return;
    if (get().metadataLoaded && !force) return;
    set({ metadataLoading: true });
    try {
      const [
        { data: usersData },
        { data: projectsData },
        { data: teamsData },
        { data: tagsData }
      ] = await Promise.all([
        supabase.from('users').select('id, email, name, role, team_ids, status, created_at').order('created_at', { ascending: false }),
        supabase.from('projects').select('id, name, is_active, created_at').order('created_at', { ascending: false }),
        supabase.from('teams').select('id, name, is_active, created_at').order('created_at', { ascending: false }),
        supabase.from('tags').select('id, name, is_active, created_at').order('created_at', { ascending: false })
      ]);

      const activeUsers = (usersData || [])
        .filter((u: any) => u.status !== 'INACTIVE' && u.name)
        .map((u: any) => u.name);

      const activeProj = (projectsData || [])
        .filter((p: any) => p.is_active !== false && p.name)
        .map((p: any) => p.name);

      const activeTms = (teamsData || [])
        .filter((t: any) => t.is_active !== false && t.name)
        .map((t: any) => t.name);

      const activeTgs = (tagsData || [])
        .filter((tg: any) => tg.is_active !== false && tg.name)
        .map((tg: any) => tg.name);

      set({
        assigneesList: activeUsers,
        projectsList: activeProj,
        teamsList: activeTms,
        tagsList: activeTgs,
        usersFullList: usersData || [],
        projectsFullList: projectsData || [],
        teamsFullList: teamsData || [],
        tagsFullList: tagsData || [],
        metadataLoaded: true,
        metadataLoading: false
      });
    } catch (err) {
      console.error('Error fetching global metadata:', err);
      set({ metadataLoading: false });
    }
  },

  fetchTasks: async (force = false) => {
    if (!force && get().tasksLoading) return;
    if (get().tasksLoaded && !force) return;
    if (force) {
      set({ activeTasksTemplatesLoaded: false });
    }
    set({ tasksLoading: true });
    try {
      const startDate = get().startDate || new Date().toISOString().split('T')[0];
      const endDate = get().endDate || startDate;

      let tasksRes: any = { data: [] };
      let taskLogsRes: any = { data: [] };
      let subtaskLogsRes: any = { data: [] };

      try {
        const [tRes, tlRes, slRes] = await Promise.all([
          supabase
            .from('tasks')
            .select('*, subtasks(*)')
            .eq('is_active', true)
            .order('created_at', { ascending: false }),
          supabase
            .from('task_logs')
            .select('*')
            .gte('todo_date', startDate)
            .lte('todo_date', endDate),
          supabase
            .from('subtask_logs')
            .select('*')
            .gte('todo_date', startDate)
            .lte('todo_date', endDate)
        ]);
        tasksRes = tRes;
        taskLogsRes = tlRes;
        subtaskLogsRes = slRes;
      } catch (err: any) {
        console.warn('[Sync] Promise.all fetch failed. Attempting resilient fallbacks...', err);
        try {
          tasksRes = await supabase.from('tasks').select('*, subtasks(*)').eq('is_active', true).order('created_at', { ascending: false });
        } catch (e1) {
          console.warn('[Sync] Resilient fallback tasks fetch error:', e1);
        }
        try {
          taskLogsRes = await supabase.from('task_logs').select('*').gte('todo_date', startDate).lte('todo_date', endDate);
        } catch (e2) {
          console.warn('[Sync] Resilient fallback task_logs fetch error:', e2);
        }
        try {
          subtaskLogsRes = await supabase.from('subtask_logs').select('*').gte('todo_date', startDate).lte('todo_date', endDate);
        } catch (e3) {
          console.warn('[Sync] Resilient fallback subtask_logs fetch error:', e3);
        }
      }

      if (tasksRes.error) {
        console.warn('[Sync] Tasks query returned error:', tasksRes.error);
      }

      let tasksRaw = tasksRes.data || [];
      const allTaskLogs = taskLogsRes.data || [];
      const allSubtaskLogs = subtaskLogsRes.data || [];

      // Fetch missing inactive templates dynamically to keep the first load super-fast and indexed
      const activeTaskIds = new Set(tasksRaw.map((t: any) => t.id));
      const loggedTaskIds = new Set([
        ...allTaskLogs.map((log: any) => log.task_id),
        ...allSubtaskLogs.map((log: any) => log.task_id)
      ].filter(Boolean));
      const missingTaskIds = Array.from(loggedTaskIds).filter(id => !activeTaskIds.has(id));

      if (missingTaskIds.length > 0) {
        try {
          const { data: historicalTasks, error: histError } = await supabase
            .from('tasks')
            .select('*, subtasks(*)')
            .in('id', missingTaskIds);
          if (!histError && historicalTasks) {
            tasksRaw = [...tasksRaw, ...historicalTasks];
          }
        } catch (histErr) {
          console.warn('[Sync] Failed to fetch historical inactive tasks:', histErr);
        }
      }

      // Hydrate backward-compatible completions object on descriptions in-memory
      const processed = tasksRaw.map((tRaw: any) => {
        // Populate task_logs and subtask_logs
        tRaw.task_logs = allTaskLogs.filter((log: any) => log.task_id === tRaw.id);
        tRaw.subtask_logs = allSubtaskLogs.filter((log: any) => log.task_id === tRaw.id);

        // Enforce unique subtasks by database primary key id to prevent double subtasks
        const uniqueSubs = (tRaw.subtasks || []).filter((sub: any, index: number, self: any[]) =>
          self.findIndex((s: any) => s.id === sub.id) === index
        );
        const task = { ...tRaw, subtasks: uniqueSubs };
        
        // Assemble metadata ảo từ cột thực tế trong DB để tương thích ngược 100% với UI
        const firstTeamName = task.subtasks?.find((s: any) => s.team_name)?.team_name || '';
        const projName = task.project_name || '';
        const tagName = task.tag_name || '';
        const teamName = task.team_name || firstTeamName;

        const noteText = task.note || '';
        const taskHistory = task.history || [];

        const sub_tasks = (task.subtasks || []).map((st: any) => ({
          id: st.id,
          content: st.content,
          assignee: st.assignee,
          est_time: st.est_time || st.estimated_minutes || 0
        }));
        const meta = {
          project_name: projName,
          team_name: teamName,
          tag_name: tagName,
          note: noteText,
          sub_tasks,
          versions: taskHistory
        };
        const completions: Record<string, any> = {};

        // Collect all unique dates from task_logs and subtask_logs
        const uniqueDates = Array.from(new Set([
          ...(task.task_logs || []).map((l: any) => l.todo_date),
          ...(task.subtask_logs || []).map((l: any) => l.todo_date)
        ]));

        uniqueDates.forEach((todoDate: string) => {
          const tLog = (task.task_logs || []).find((l: any) => l.todo_date === todoDate);
          
          let todo_status: 'NEW' | 'DONE' | 'SKIPPED' = 'NEW';
          if (tLog) {
            const normalizedStatus = (tLog.status || '').toUpperCase();
            if (normalizedStatus === 'DONE' || normalizedStatus === 'SUBMITTED') {
              todo_status = 'DONE';
            } else if (normalizedStatus === 'SKIPPED') {
              todo_status = 'SKIPPED';
            }
          }

          // Map active subtasks completion details for this date
          const sub_tasks_mapped = (task.subtasks || []).map((st: any) => {
            const stLog = (task.subtask_logs || []).find(
              (sl: any) => sl.subtask_id === st.id && sl.todo_date === todoDate
            );
            let sub_status: 'New' | 'Done' | 'Skipped' = 'New';
            if (stLog) {
              const sUpper = (stLog.status || '').toUpperCase();
              if (sUpper === 'DONE' || sUpper === 'SUBMITTED' || stLog.is_completed) {
                sub_status = 'Done';
              } else if (sUpper === 'SKIPPED') {
                sub_status = 'Skipped';
              }
            }
            const matchedEst = stLog ? (stLog.est_time !== undefined && stLog.est_time !== null ? stLog.est_time : stLog.estimated_minutes) : undefined;
            const matchedAct = stLog ? (stLog.actual_time !== undefined && stLog.actual_time !== null ? stLog.actual_time : stLog.actual_minutes) : undefined;
            const resolvedAct = (sub_status === 'New' && (matchedAct === 0 || matchedAct === undefined || matchedAct === null)) 
              ? undefined 
              : (matchedAct !== undefined && matchedAct !== null ? matchedAct : 0);

            return {
              id: st.id,
              content: st.content,
              name: st.content,
              assignee: st.assignee,
              est_time: st.est_time || st.estimated_minutes || 0,
              actual_time: resolvedAct,
              sub_status
            };
          });

          // Fallback logic for todo_status if no task log exists but subtasks have logs
          if (!tLog && sub_tasks_mapped.length > 0) {
            const allDone = sub_tasks_mapped.every((s: any) => s.sub_status === 'Done');
            const allSkipped = sub_tasks_mapped.every((s: any) => s.sub_status === 'Skipped');
            if (allDone) {
              todo_status = 'DONE';
            } else if (allSkipped) {
              todo_status = 'SKIPPED';
            }
          }

          const actual_time = tLog 
            ? (tLog.actual_time !== undefined ? tLog.actual_time : tLog.actual_minutes || 0) 
            : sub_tasks_mapped.reduce((sum: number, s: any) => sum + (s.sub_status === 'Done' ? (s.actual_time || 0) : 0), 0);

          completions[todoDate] = {
            todo_status,
            actual_time,
            sub_tasks: sub_tasks_mapped
          };
        });

        const enrichedMeta = {
          ...meta,
          completions
        };

        const resolvedTaskName = task.task_name || task.title || '';
        const resolvedType = task.type || task.task_type || 'DAILY';

        const assignees = Array.from(new Set(
          (task.subtasks || []).map((st: any) => st.assignee).filter(Boolean)
        ));

        return {
          ...task,
          assignees,
          description: JSON.stringify(enrichedMeta),
          task_name: resolvedTaskName,
          title: resolvedTaskName,
          type: resolvedType,
          task_type: resolvedType
        };
      });

      set({
        tasks: processed,
        tasksLoaded: true,
        tasksLoading: false
      });

      // Tự động đồng bộ hóa dailyTasks khi fetchTasks(true) được gọi để tránh lệch dữ liệu giữa các tab
      if (force && get().startDate) {
        get().fetchDailyTasks(get().startDate, get().endDate, true, true);
      }
    } catch (err: any) {
      console.error('Error fetching global tasks:', err);
      if (err && typeof err === 'object') {
        console.error('Error Details - Message:', err.message, 'Code:', err.code, 'Details:', err.details, 'Hint:', err.hint);
      }
      set({ tasksLoading: false });
    }
  },

  fetchApproveTasks: async (force = false) => {
    if (!force && get().approveTasksLoading) return;
    if (get().approveTasksLoaded && !force) return;
    set({ approveTasksLoading: true });
    try {
      const { data, error } = await supabase
        .from('approve_tasks')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      set({
        approveTasks: data || [],
        approveTasksLoaded: true,
        approveTasksLoading: false
      });
    } catch (err) {
      console.error('Error fetching global approve tasks:', err);
      set({ approveTasksLoading: false });
    }
  },

  fetchDailyTasks: async (startDateString: string, endDateString?: string, isSilent = false, forceTemplates = false) => {
    if (!isSilent && get().dailyTasksLoading) return;
    set({ 
      dailyTasksLoading: true, 
      ...(isSilent ? {} : { dailyTasksLoaded: false })
    });
    try {
      let tasksData = get().activeTasksTemplates;
      
      if (forceTemplates || !get().activeTasksTemplatesLoaded || tasksData.length === 0) {
        // 1. Chỉ tải các task bản mẫu đang hoạt động (is_active = true) kèm subtasks của chúng khi chưa có cache hoặc bị buộc tải lại
        // Giải pháp này giúp hệ thống hoạt động cực kỳ mượt mà khi số lượng task lưu trữ lớn lên theo thời gian.
        try {
          const { data: activeTasks, error: tasksError } = await supabase
            .from('tasks')
            .select(`
              *,
              subtasks(*)
            `)
            .eq('is_active', true);

          if (tasksError) throw tasksError;
          tasksData = activeTasks || [];
          set({ 
            activeTasksTemplates: tasksData,
            activeTasksTemplatesLoaded: true
          });
        } catch (tasksErr: any) {
          console.warn('[Sync] Failed to fetch active task templates:', tasksErr);
          // Don't crash, keep whatever we have
        }
      }

      // 2. Fetch daily logs for the target date or date range
      let taskLogsQuery = supabase.from('task_logs').select('*');
      let subtaskLogsQuery = supabase.from('subtask_logs').select('*');

      if (endDateString) {
        taskLogsQuery = taskLogsQuery.gte('todo_date', startDateString).lte('todo_date', endDateString);
        subtaskLogsQuery = subtaskLogsQuery.gte('todo_date', startDateString).lte('todo_date', endDateString);
      } else {
        taskLogsQuery = taskLogsQuery.eq('todo_date', startDateString);
        subtaskLogsQuery = subtaskLogsQuery.eq('todo_date', startDateString);
      }

      let taskLogsData: any[] = [];
      let subtaskLogsData: any[] = [];

      try {
        const [taskLogsRes, subtaskLogsRes] = await Promise.all([
          taskLogsQuery,
          subtaskLogsQuery
        ]);
        taskLogsData = taskLogsRes.data || [];
        subtaskLogsData = subtaskLogsRes.data || [];
      } catch (err) {
        console.warn('[Sync] Failed to perform Promise.all daily logs fetch. Trying individual fallbacks...', err);
        try {
          const res1 = await taskLogsQuery;
          taskLogsData = res1.data || [];
        } catch (e1) {
          console.warn('[Sync] Individual task logs fallback fetch error:', e1);
        }
        try {
          const res2 = await subtaskLogsQuery;
          subtaskLogsData = res2.data || [];
        } catch (e2) {
          console.warn('[Sync] Individual subtask logs fallback fetch error:', e2);
        }
      }

      // 3. Tìm các task ID đã bị tắt hoạt động (inactive) nhưng vẫn có dữ liệu log lịch sử trong ngày này để tải bổ sung
      const activeTaskIds = new Set((tasksData || []).map(t => t.id));
      const loggedTaskIds = new Set([
        ...taskLogsData.map(log => log.task_id),
        ...subtaskLogsData.map(log => log.task_id)
      ].filter(Boolean));

      const missingTaskIds = Array.from(loggedTaskIds).filter(id => !activeTaskIds.has(id));

      if (missingTaskIds.length > 0) {
        const { data: historicalTasks, error: histError } = await supabase
          .from('tasks')
          .select(`
            *,
            subtasks(*)
          `)
          .in('id', missingTaskIds);
        
        if (!histError && historicalTasks) {
          tasksData = [...tasksData, ...historicalTasks];
        }
      }

      // 3. Assemble and virtualize on the frontend
      const processed = (tasksData || []).map((tRaw: any) => {
        // Enforce unique subtasks by database primary key id to prevent double subtasks
        const uniqueSubs = (tRaw.subtasks || []).filter((sub: any, index: number, self: any[]) =>
          self.findIndex((s: any) => s.id === sub.id) === index
        );
        const task = { ...tRaw, subtasks: uniqueSubs };
        
        // Assemble metadata ảo từ cột thực tế trong DB để tương thích ngược 100% với UI
        const firstTeamName = task.subtasks?.find((s: any) => s.team_name)?.team_name || '';
        const projName = task.project_name || '';
        const tagName = task.tag_name || '';
        const teamName = task.team_name || firstTeamName;

        const noteText = task.note || '';
        const taskHistory = task.history || [];
        const meta = {
          project_name: projName,
          team_name: teamName,
          tag_name: tagName,
          note: noteText,
          versions: taskHistory
        };

        const taskLogs = taskLogsData.filter((log: any) => log.task_id === task.id);
        const taskSubtaskLogs = subtaskLogsData.filter((log: any) => log.task_id === task.id);
        
        const subtasksWithLogs = (task.subtasks || []).map((subtask: any) => {
          const matchedSubtaskLogs = subtaskLogsData.filter((log: any) => log.subtask_id === subtask.id);
          const mappedLogs = matchedSubtaskLogs.map((log: any) => ({
            ...log,
            est_time: log.est_time !== undefined && log.est_time !== null ? log.est_time : log.estimated_minutes,
            actual_time: log.actual_time !== undefined && log.actual_time !== null ? log.actual_time : log.actual_minutes
          }));
          return {
            ...subtask,
            est_time: subtask.est_time !== undefined && subtask.est_time !== null ? subtask.est_time : subtask.estimated_minutes,
            name: subtask.name || subtask.content, // Backward compatibility with UI name property
            subtask_logs: mappedLogs
          };
        });

        const resolvedTaskName = task.task_name || task.title || '';
        const resolvedType = task.type || task.task_type || 'DAILY';

        const assignees = Array.from(new Set(
          (subtasksWithLogs || []).map((s: any) => s.assignee).filter(Boolean)
        ));

        return {
          ...task,
          assignees,
          description: JSON.stringify(meta),
          task_name: resolvedTaskName,
          title: resolvedTaskName,
          type: resolvedType,
          task_type: resolvedType,
          subtasks: subtasksWithLogs,
          task_logs: taskLogs,
          subtask_logs: taskSubtaskLogs
        };
      });

      set({
        dailyTasks: processed,
        dailyTasksLoaded: true,
        dailyTasksLoading: false
      });
    } catch (err: any) {
      console.error('Error fetching daily tasks:', err);
      if (err && typeof err === 'object') {
        console.error('Error Details - Message:', err.message, 'Code:', err.code, 'Details:', err.details, 'Hint:', err.hint);
      }
      set({ dailyTasksLoading: false });
    }
  },

  setTasks: (tasksUpdater) => {
    if (typeof tasksUpdater === 'function') {
      set((state) => ({ tasks: tasksUpdater(state.tasks) }));
    } else {
      set({ tasks: tasksUpdater });
    }
  },

  setLastSyncTime: (time) => set({ lastSyncTime: time }),

  syncDeltaUpdates: async (): Promise<boolean> => {
    const lastSync = get().lastSyncTime;
    const now = new Date().toISOString();

    try {
      // 1. Query bảng tasks (kèm subtasks, task_logs, subtask_logs) với điều kiện .gt('updated_at', lastSync) hoặc .gt('created_at', lastSync)
      let updatedTasksRaw: any[] | null = null;
      let tasksError: any = null;

      if (hasUpdatedAtColumn) {
        const { data, error } = await supabase
          .from('tasks')
          .select('*, subtasks(*)')
          .gt('updated_at', lastSync);
        
        if (error) {
          if (error.code === '42703') {
            hasUpdatedAtColumn = false;
            console.log('[Sync] tasks.updated_at column does not exist. Switching to created_at for delta sync.');
          } else {
            tasksError = error;
          }
        } else {
          updatedTasksRaw = data;
        }
      }

      if (!hasUpdatedAtColumn && !tasksError) {
        const { data, error } = await supabase
          .from('tasks')
          .select('*, subtasks(*)')
          .gt('created_at', lastSync);
        
        if (error) {
          tasksError = error;
        } else {
          updatedTasksRaw = data;
        }
      }

      if (tasksError) throw tasksError;

      const tasksList = updatedTasksRaw || [];
      if (tasksList.length > 0) {
        const updatedTaskIds = tasksList.map((t: any) => t.id);
        const [taskLogsRes, subtaskLogsRes] = await Promise.all([
          supabase
            .from('task_logs')
            .select('*')
            .in('task_id', updatedTaskIds),
          supabase
            .from('subtask_logs')
            .select('*')
            .in('task_id', updatedTaskIds)
        ]);

        const taskLogsData = taskLogsRes.data || [];
        const subtaskLogsData = subtaskLogsRes.data || [];

        tasksList.forEach((tRaw: any) => {
          const taskId = tRaw.id;
          tRaw.task_logs = taskLogsData.filter((l: any) => l.task_id === taskId);
          tRaw.subtask_logs = subtaskLogsData.filter((l: any) => l.task_id === taskId);
        });
      }

      // 2. Fetch riêng lại các logs nằm trong khoảng startDate đến endDate hiện tại để bổ sung nếu cần
      let taskLogsData: any[] = [];
      let subtaskLogsData: any[] = [];
      const startDate = get().startDate;
      const endDate = get().endDate;

      if (startDate) {
        let taskLogsQuery = supabase.from('task_logs').select('*');
        let subtaskLogsQuery = supabase.from('subtask_logs').select('*');

        if (endDate) {
          taskLogsQuery = taskLogsQuery.gte('todo_date', startDate).lte('todo_date', endDate);
          subtaskLogsQuery = subtaskLogsQuery.gte('todo_date', startDate).lte('todo_date', endDate);
        } else {
          taskLogsQuery = taskLogsQuery.eq('todo_date', startDate);
          subtaskLogsQuery = subtaskLogsQuery.eq('todo_date', startDate);
        }

        const [taskLogsRes, subtaskLogsRes] = await Promise.all([
          taskLogsQuery,
          subtaskLogsQuery
        ]);

        taskLogsData = taskLogsRes.data || [];
        subtaskLogsData = subtaskLogsRes.data || [];
      }

      // Helper function to merge logs (replaces only target dates' logs in the task's raw logs)
      const mergeLogs = (existingLogs: any[] = [], fetchedLogs: any[] = [], start?: string, end?: string) => {
        if (!start) return existingLogs;
        const otherLogs = existingLogs.filter(log => {
          const d = log.todo_date;
          if (end) {
            return !(d >= start && d <= end);
          } else {
            return d !== start;
          }
        });
        return [...otherLogs, ...fetchedLogs];
      };

      // Helper for processing global tasks
      const processTaskForGlobalTasks = (tRaw: any) => {
        const uniqueSubs = (tRaw.subtasks || []).filter((sub: any, index: number, self: any[]) =>
          self.findIndex((s: any) => s.id === sub.id) === index
        );
        const task = { ...tRaw, subtasks: uniqueSubs };
        
        const firstTeamName = task.subtasks?.find((s: any) => s.team_name)?.team_name || '';
        const projName = task.project_name || '';
        const tagName = task.tag_name || '';
        const teamName = task.team_name || firstTeamName;

        const noteText = task.note || '';
        const taskHistory = task.history || [];

        const sub_tasks = (task.subtasks || []).map((st: any) => ({
          id: st.id,
          content: st.content,
          assignee: st.assignee,
          est_time: st.est_time || st.estimated_minutes || 0
        }));
        const meta = {
          project_name: projName,
          team_name: teamName,
          tag_name: tagName,
          note: noteText,
          sub_tasks,
          versions: taskHistory
        };
        const completions: Record<string, any> = {};

        const uniqueDates = Array.from(new Set([
          ...(task.task_logs || []).map((l: any) => l.todo_date),
          ...(task.subtask_logs || []).map((l: any) => l.todo_date)
        ]));

        uniqueDates.forEach((todoDate: string) => {
          const tLog = (task.task_logs || []).find((l: any) => l.todo_date === todoDate);
          
          let todo_status: 'NEW' | 'DONE' | 'SKIPPED' = 'NEW';
          if (tLog) {
            const normalizedStatus = (tLog.status || '').toUpperCase();
            if (normalizedStatus === 'DONE' || normalizedStatus === 'SUBMITTED') {
              todo_status = 'DONE';
            } else if (normalizedStatus === 'SKIPPED') {
              todo_status = 'SKIPPED';
            }
          }

          const sub_tasks_mapped = (task.subtasks || []).map((st: any) => {
            const stLog = (task.subtask_logs || []).find(
              (sl: any) => sl.subtask_id === st.id && sl.todo_date === todoDate
            );
            let sub_status: 'New' | 'Done' | 'Skipped' = 'New';
            if (stLog) {
              const sUpper = (stLog.status || '').toUpperCase();
              if (sUpper === 'DONE' || sUpper === 'SUBMITTED' || stLog.is_completed) {
                sub_status = 'Done';
              } else if (sUpper === 'SKIPPED') {
                sub_status = 'Skipped';
              }
            }
            const matchedEst = stLog ? (stLog.est_time !== undefined && stLog.est_time !== null ? stLog.est_time : stLog.estimated_minutes) : undefined;
            const matchedAct = stLog ? (stLog.actual_time !== undefined && stLog.actual_time !== null ? stLog.actual_time : stLog.actual_minutes) : undefined;
            const resolvedAct = (sub_status === 'New' && (matchedAct === 0 || matchedAct === undefined || matchedAct === null)) 
              ? undefined 
              : (matchedAct !== undefined && matchedAct !== null ? matchedAct : 0);

            return {
              id: st.id,
              content: st.content,
              name: st.content,
              assignee: st.assignee,
              est_time: st.est_time || st.estimated_minutes || 0,
              actual_time: resolvedAct,
              sub_status
            };
          });

          if (!tLog && sub_tasks_mapped.length > 0) {
            const allDone = sub_tasks_mapped.every((s: any) => s.sub_status === 'Done');
            const allSkipped = sub_tasks_mapped.every((s: any) => s.sub_status === 'Skipped');
            if (allDone) {
              todo_status = 'DONE';
            } else if (allSkipped) {
              todo_status = 'SKIPPED';
            }
          }

          const actual_time = tLog 
            ? (tLog.actual_time !== undefined ? tLog.actual_time : tLog.actual_minutes || 0) 
            : sub_tasks_mapped.reduce((sum: number, s: any) => sum + (s.sub_status === 'Done' ? (s.actual_time || 0) : 0), 0);

          completions[todoDate] = {
            todo_status,
            actual_time,
            sub_tasks: sub_tasks_mapped
          };
        });

        const enrichedMeta = {
          ...meta,
          completions
        };

        const resolvedTaskName = task.task_name || task.title || '';
        const resolvedType = task.type || task.task_type || 'DAILY';

        const assignees = Array.from(new Set(
          (task.subtasks || []).map((st: any) => st.assignee).filter(Boolean)
        ));

        return {
          ...task,
          assignees,
          description: JSON.stringify(enrichedMeta),
          task_name: resolvedTaskName,
          title: resolvedTaskName,
          type: resolvedType,
          task_type: resolvedType
        };
      };

      // Helper for processing daily tasks
      const processTaskForDailyTasks = (task: any, taskLogs: any[], subtaskLogs: any[]) => {
        const uniqueSubs = (task.subtasks || []).filter((sub: any, index: number, self: any[]) =>
          self.findIndex((s: any) => s.id === sub.id) === index
        );
        const taskEnforced = { ...task, subtasks: uniqueSubs };
        
        const firstTeamName = taskEnforced.subtasks?.find((s: any) => s.team_name)?.team_name || '';
        const projName = taskEnforced.project_name || '';
        const tagName = taskEnforced.tag_name || '';
        const teamName = taskEnforced.team_name || firstTeamName;

        const noteText = taskEnforced.note || '';
        const taskHistory = taskEnforced.history || [];
        const meta = {
          project_name: projName,
          team_name: teamName,
          tag_name: tagName,
          note: noteText,
          versions: taskHistory
        };

        const subtasksWithLogs = (taskEnforced.subtasks || []).map((subtask: any) => {
          const matchedSubtaskLogs = subtaskLogs.filter((log: any) => log.subtask_id === subtask.id);
          const mappedLogs = matchedSubtaskLogs.map((log: any) => ({
            ...log,
            est_time: log.est_time !== undefined && log.est_time !== null ? log.est_time : log.estimated_minutes,
            actual_time: log.actual_time !== undefined && log.actual_time !== null ? log.actual_time : log.actual_minutes
          }));
          return {
            ...subtask,
            est_time: subtask.est_time !== undefined && subtask.est_time !== null ? subtask.est_time : subtask.estimated_minutes,
            name: subtask.name || subtask.content,
            subtask_logs: mappedLogs
          };
        });

        const resolvedTaskName = taskEnforced.task_name || taskEnforced.title || '';
        const resolvedType = taskEnforced.type || taskEnforced.task_type || 'DAILY';

        const assignees = Array.from(new Set(
          (subtasksWithLogs || []).map((s: any) => s.assignee).filter(Boolean)
        ));

        return {
          ...taskEnforced,
          assignees,
          description: JSON.stringify(meta),
          task_name: resolvedTaskName,
          title: resolvedTaskName,
          type: resolvedType,
          task_type: resolvedType,
          subtasks: subtasksWithLogs,
          task_logs: taskLogs,
          subtask_logs: subtaskLogs
        };
      };

      // 3. MERGE logical updates for standard 'tasks' state
      const processedGlobalUpdates = (updatedTasksRaw || []).map((dbTask: any) => {
        const taskId = dbTask.id;
        const taskLogsForThisTask = taskLogsData.filter((log: any) => log.task_id === taskId);
        const subtaskLogsForThisTask = subtaskLogsData.filter((log: any) => log.task_id === taskId);

        const mergedTaskLogs = mergeLogs(dbTask.task_logs || [], taskLogsForThisTask, startDate, endDate);
        const mergedSubtaskLogs = mergeLogs(dbTask.subtask_logs || [], subtaskLogsForThisTask, startDate, endDate);

        const taskToProcess = {
          ...dbTask,
          task_logs: mergedTaskLogs,
          subtask_logs: mergedSubtaskLogs
        };

        return processTaskForGlobalTasks(taskToProcess);
      });

      const processedDailyUpdates = (updatedTasksRaw || []).map((dbTask: any) => {
        const taskId = dbTask.id;
        const taskLogsForThisTask = taskLogsData.filter((log: any) => log.task_id === taskId);
        const subtaskLogsForThisTask = subtaskLogsData.filter((log: any) => log.task_id === taskId);

        return processTaskForDailyTasks(dbTask, taskLogsForThisTask, subtaskLogsForThisTask);
      });

      const processedGlobalMap = new Map();
      processedGlobalUpdates.forEach((task: any) => {
        processedGlobalMap.set(task.id, task);
      });

      const processedDailyMap = new Map();
      processedDailyUpdates.forEach((task: any) => {
        processedDailyMap.set(task.id, task);
      });

      const currentTasks = get().tasks;
      const nextTasks: any[] = [];
      const updatedTaskIdsInState = new Set<string>();

      currentTasks.forEach((existingTask: any) => {
        if (processedGlobalMap.has(existingTask.id)) {
          nextTasks.push(processedGlobalMap.get(existingTask.id));
          updatedTaskIdsInState.add(existingTask.id);
        } else {
          nextTasks.push(existingTask); // GIỮ NGUYÊN HOÀN TOÀN
        }
      });

      processedGlobalUpdates.forEach((task: any) => {
        if (!updatedTaskIdsInState.has(task.id)) {
          nextTasks.push(task);
        }
      });

      // 4. MERGE logical updates for 'dailyTasks' state
      const currentDailyTasks = get().dailyTasks;
      const nextDailyTasks: any[] = [];
      const updatedDailyTaskIdsInState = new Set<string>();

      currentDailyTasks.forEach((existingDailyTask: any) => {
        if (processedDailyMap.has(existingDailyTask.id)) {
          nextDailyTasks.push(processedDailyMap.get(existingDailyTask.id));
          updatedDailyTaskIdsInState.add(existingDailyTask.id);
        } else {
          nextDailyTasks.push(existingDailyTask); // GIỮ NGUYÊN HOÀN TOÀN
        }
      });

      processedDailyUpdates.forEach((task: any) => {
        if (!updatedDailyTaskIdsInState.has(task.id)) {
          nextDailyTasks.push(task);
        }
      });

      // Đồng thời cập nhật danh sách approve_tasks khi đồng bộ delta
      await get().fetchApproveTasks(true);

      set({
        tasks: nextTasks,
        dailyTasks: nextDailyTasks,
        lastSyncTime: now
      });
      return true;
    } catch (err: any) {
      console.warn('[Sync] Delta sync failed, performing self-healing full synchronization fallback...', err);
      if (err && typeof err === 'object') {
        console.warn('Error Details - Message:', err.message, 'Code:', err.code, 'Details:', err.details, 'Hint:', err.hint);
      }
      try {
        await get().fetchTasks(true);
        await get().fetchMetadata(true);
        await get().fetchApproveTasks(true);
        const startDate = get().startDate;
        if (startDate) {
          await get().fetchDailyTasks(startDate, get().endDate, true, true);
        }
        set({ lastSyncTime: now });
        return true;
      } catch (fallbackErr) {
        console.warn('[Sync] Full synchronization fallback also failed:', fallbackErr);
        return false;
      }
    }
  }

}));
