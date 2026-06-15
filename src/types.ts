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

export interface Subtask {
  id: string;
  name: string;
  assignee: string;
  estimated_minutes: number;
  actual_minutes?: number; // Thêm actual_minutes
  status?: 'NEW' | 'IN_PROGRESS' | 'DONE'; // Thêm status thay vì chỉ is_completed
  is_completed: boolean;
}

export interface Task {
  id: string;
  task_name: string;
  tag_id: string;
  project_id: string;
  team_id: string;
  type: 'DAILY' | 'WEEKLY' | 'ONCE';
  
  // Các field thời gian mới theo Phase 2 (Migration 1)
  deadline_time?: string | null;     // VD: "08:30" hoặc "17:00:00"
  deadline_days?: string[] | null;   // VD: ["Mon", "Tue"]
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

  fetchMetadata: (force?: boolean) => Promise<void>;
  fetchTasks: (force?: boolean) => Promise<void>;
  fetchApproveTasks: (force?: boolean) => Promise<void>;
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
        .select('*')
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

  setTasks: (tasksUpdater) => {
    if (typeof tasksUpdater === 'function') {
      set((state) => ({ tasks: tasksUpdater(state.tasks) }));
    } else {
      set({ tasks: tasksUpdater });
    }
  }
}));