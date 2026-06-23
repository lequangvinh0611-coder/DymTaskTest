import { create } from 'zustand';
import { supabase } from './lib/supabase';

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

  fetchMetadata: (force?: boolean) => Promise<void>;
  fetchTasks: (force?: boolean) => Promise<void>;
  fetchApproveTasks: (force?: boolean) => Promise<void>;
  fetchDailyTasks: (startDateString: string, endDateString?: string, isSilent?: boolean) => Promise<void>;
  setTasks: (tasks: any[] | ((prev: any[]) => any[])) => void;
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

  // Date tracking for daily tasks
  startDate: typeof window !== 'undefined' ? (sessionStorage.getItem('todo_startDate') || getTodayDateStringInternal()) : '',
  endDate: typeof window !== 'undefined' ? (sessionStorage.getItem('todo_endDate') || getTodayDateStringInternal()) : '',
  setDates: (start: string, end: string) => set({ startDate: start, endDate: end }),

  fetchMetadata: async (force = false) => {
    if (get().metadataLoading) return;
    if (get().metadataLoaded && !force) return;
    set({ metadataLoading: true });
    try {
      const [
        { data: usersData },
        { data: projectsData },
        { data: teamsData },
        { data: tagsData }
      ] = await Promise.all([
        supabase.from('users').select('name, status, team_ids'),
        supabase.from('projects').select('name, is_active'),
        supabase.from('teams').select('name, is_active'),
        supabase.from('tags').select('name, is_active')
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
        metadataLoaded: true,
        metadataLoading: false
      });
    } catch (err) {
      console.error('Error fetching global metadata:', err);
      set({ metadataLoading: false });
    }
  },

  fetchTasks: async (force = false) => {
    if (get().tasksLoading) return;
    if (get().tasksLoaded && !force) return;
    set({ tasksLoading: true });
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          subtasks(*),
          task_logs(*),
          subtask_logs(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Hydrate backward-compatible completions object on descriptions in-memory
      const processed = (data || []).map((tRaw: any) => {
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

            return {
              id: st.id,
              content: st.content,
              name: st.content,
              assignee: st.assignee,
              est_time: st.est_time || st.estimated_minutes || 0,
              actual_time: matchedAct || 0,
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

        return {
          ...task,
          description: JSON.stringify(enrichedMeta),
          task_name: task.title,
          type: task.task_type
        };
      });

      set({
        tasks: processed,
        tasksLoaded: true,
        tasksLoading: false
      });
    } catch (err) {
      console.error('Error fetching global tasks:', err);
      set({ tasksLoading: false });
    }
  },

  fetchApproveTasks: async (force = false) => {
    if (get().approveTasksLoading) return;
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

  fetchDailyTasks: async (startDateString: string, endDateString?: string, isSilent = false) => {
    if (get().dailyTasksLoading) return;
    set({ 
      dailyTasksLoading: true, 
      ...(isSilent ? {} : { dailyTasksLoaded: false })
    });
    try {
      // 1. Fetch all template tasks and nested subtasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          *,
          subtasks(*)
        `);

      if (tasksError) throw tasksError;

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

      const [taskLogsRes, subtaskLogsRes] = await Promise.all([
        taskLogsQuery,
        subtaskLogsQuery
      ]);

      const taskLogsData = taskLogsRes.data || [];
      const subtaskLogsData = subtaskLogsRes.data || [];

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

        return {
          ...task,
          description: JSON.stringify(meta),
          task_name: task.task_name || task.title, // Backward compatibility with task_name property
          type: task.type || task.task_type, // Map task_type to legacy type
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
    } catch (err) {
      console.error('Error fetching daily tasks:', err);
      set({ dailyTasksLoading: false });
    }
  },

  setTasks: (tasksUpdater) => {
    if (typeof tasksUpdater === 'function') {
      set((state) => ({ tasks: tasksUpdater(state.tasks) }));
    } else {
      set({ tasks: tasksUpdater });
    }
  }
}));
