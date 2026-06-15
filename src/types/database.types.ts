export type UserRole = 'master' | 'admin' | 'user';
export type TaskStatus = 'NEW' | 'IN_PROGRESS' | 'DONE' | 'SUBMITTED' | 'SKIPPED';
export type TaskType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ONETIME';

export interface UserProfile {
  id: string; // UUID from auth.users
  email: string;
  name: string;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  
  // Thay thế cho 'teams: string[]' cũ
  // Dùng khi bạn query kèm bảng user_teams
  user_teams?: { team_id: string }[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  created_at: string;
}

export interface Subtask {
  id: string;
  name: string;                      // ✅ Changed from 'title' to match DB
  assignee?: string;                 // User email
  estimated_minutes?: number;
  actual_minutes?: number;
  status?: string;
  is_completed?: boolean;
  created_at?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  is_active: boolean;
  est_time: number;
  actual_time: number;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  description?: string;
  user_id: string | null;
  user_name: string | null;
  metadata: any; // Ánh xạ JSONB
  created_at: string;
}