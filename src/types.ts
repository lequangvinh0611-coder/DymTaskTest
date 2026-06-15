import { create } from 'zustand';
import { supabase } from './lib/supabase';

export type UserRole = 'master' | 'admin' | 'user';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE';
  // Đã xóa string[] teams cũ, thay bằng quan hệ từ bảng user_teams
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
}

export interface Subtask {
  id: string;
  task_id?: string;
  name?: string;                     // Giữ name? cho tương thích ngược với UI
  content: string;                    // Cột mới template con subtasks
  assignee: string;
  estimated_minutes?: number;
  actual_minutes?: number;            // Thêm actual_minutes
  status?: 'NEW' | 'IN_PROGRESS' | 'DONE'; // Thêm status thay vì chỉ is_completed
  is_completed?: boolean;
  subtask_logs?: SubtaskLog[];        // Chứa dữ liệu nhật ký subtask ngày
}

export interface Task {
  id: string;
  task_name: string;                  // Giữ nguyên cho tương thích ngược
  title?: string;                    // Cột mới ở bảng tasks mới
  description?: string | null;       // Cột mới (chỉ còn note/mô tả thuần)
  tag_id: string;
  project_id: string;
  team_id: string;
  type: 'DAILY' | 'WEEKLY' | 'ONCE' | 'MONTHLY' | 'ONETIME'; // Kiểu cũ/mới của task
  task_type?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONETIME'; // Trường mới
  
  // Các field thời gian mới theo Phase 2 (Migration 1)
  deadline_time?: string | null;     // VD: "08:30" hoặc "17:00:00"
  deadline_days?: string | null;     // Cột độc lập chứa ngày lặp lại dưới dạng TEXT
  estimated_minutes: number;         // Chuyển sang lưu số phút
  actual_minutes: number;            // Chuyển sang lưu số phút

  status: 'NEW' | 'IN_PROGRESS' | 'DONE' | 'SUBMITTED';
  subtasks: Subtask[];
  assignees: string[]; // Mảng email
  created_at: string;
  updated_at?: string;

  // Thuộc tính quan hệ (sinh ra khi gọi Supabase select đi kèm bảng khác)
  projects?: { name: string };
  teams?: { name: string };
  tags?: { name: string; color?: string };

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

  fetchMetadata: (force?: boolean) => Promise<void>;
  fetchTasks: (force?: boolean) => Promise<void>;
  fetchApproveTasks: (force?: boolean) => Promise<void>;
  fetchDailyTasks: (dateString: string) => Promise<void>;
  setTasks: (tasks: any[] | ((prev: any[]) => any[])) => void;
}

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
          projects(name),
          teams(name),
          tags(name, color),
          subtasks(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({
        tasks: data || [],
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

  fetchDailyTasks: async (dateString: string) => {
    if (get().dailyTasksLoading) return;
    set({ dailyTasksLoading: true });
    try {
      // 1. Fetch all template tasks and nested subtasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select(`
          *,
          projects(name),
          teams(name),
          tags(name, color),
          subtasks(*)
        `)
        .eq('is_active', true);

      if (tasksError) throw tasksError;

      // 2. Fetch daily logs for the target date
      const [taskLogsRes, subtaskLogsRes] = await Promise.all([
        supabase.from('task_logs').select('*').eq('todo_date', dateString),
        supabase.from('subtask_logs').select('*').eq('todo_date', dateString)
      ]);

      const taskLogsData = taskLogsRes.data || [];
      const subtaskLogsData = subtaskLogsRes.data || [];

      // 3. Assemble and virtualize on the frontend
      const processed = (tasksData || []).map((task: any) => {
        const taskLogs = taskLogsData.filter((log: any) => log.task_id === task.id);
        
        const subtasksWithLogs = (task.subtasks || []).map((subtask: any) => {
          const matchedSubtaskLogs = subtaskLogsData.filter((log: any) => log.subtask_id === subtask.id);
          return {
            ...subtask,
            name: subtask.name || subtask.content, // Backward compatibility with UI name property
            subtask_logs: matchedSubtaskLogs
          };
        });

        return {
          ...task,
          task_name: task.task_name || task.title, // Backward compatibility with task_name property
          type: task.type || task.task_type, // Map task_type to legacy type
          subtasks: subtasksWithLogs,
          task_logs: taskLogs
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
