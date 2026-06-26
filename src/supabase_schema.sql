-- 1. Create Custom Types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('master', 'admin', 'user');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE task_status AS ENUM ('NEW', 'IN_PROGRESS', 'DONE', 'SUBMITTED', 'SKIPPED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE task_type AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'ONETIME');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enable status 'SKIPPED' if it was missing in ENUM (for existing DBs)
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'SKIPPED';

-- 2. Create Users Table (Essential for Profile & Roles)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role user_role DEFAULT 'user' NOT NULL,
    teams TEXT[] DEFAULT '{}', -- Legacy
    team_ids TEXT[] DEFAULT '{}', -- New standard
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure team_ids exists if table was created previously
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS team_ids TEXT[] DEFAULT '{}';

-- 2.1 Master Data Tables
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create Tasks Table (Simplified and Robust)
-- Note: Adjusted to include all missing columns seen in code
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_id SERIAL UNIQUE, -- Auto-incrementing readable ID
    task_name TEXT NOT NULL,
    user_id UUID REFERENCES public.users(id),
    tag_id UUID REFERENCES public.tags(id),
    project_id UUID REFERENCES public.projects(id),
    team_id UUID REFERENCES public.teams(id),
    team_ids TEXT[] DEFAULT '{}', -- Multi-team support
    type task_type DEFAULT 'ONETIME' NOT NULL,
    deadline_time TIME,
    deadline_days TEXT[],
    deadline_date DATE,
    deadline_day_num INTEGER,
    estimated_minutes INTEGER DEFAULT 0,
    actual_minutes INTEGER DEFAULT 0,
    status task_status DEFAULT 'NEW' NOT NULL,
    subtasks JSONB DEFAULT '[]'::jsonb,
    assignees TEXT[] DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- If table already exists, ensure columns are present
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS team_ids TEXT[] DEFAULT '{}';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS display_id SERIAL; -- Note: Adding SERIAL to existing column is tricky, usually better to create with it.
ALTER TABLE public.tasks ADD CONSTRAINT tasks_display_id_unique UNIQUE (display_id);

-- 4. Create Subtasks Table
CREATE TABLE IF NOT EXISTS public.subtasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    assignee TEXT,
    estimated_minutes INTEGER DEFAULT 0,
    actual_minutes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    team_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON public.subtasks (task_id);

-- 5. Create Task Logs Table
CREATE TABLE IF NOT EXISTS public.task_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    todo_date DATE NOT NULL,
    status TEXT DEFAULT 'NEW',
    actual_minutes INTEGER DEFAULT 0,
    updated_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT unique_task_date UNIQUE (task_id, todo_date)
);

CREATE INDEX IF NOT EXISTS idx_task_logs_query ON public.task_logs (todo_date, task_id);

-- 6. Create Subtask Logs Table
CREATE TABLE IF NOT EXISTS public.subtask_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subtask_id UUID REFERENCES public.subtasks(id) ON DELETE CASCADE,
    task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
    todo_date DATE NOT NULL,
    is_completed BOOLEAN DEFAULT true,
    status TEXT DEFAULT 'DONE',
    actual_minutes INTEGER DEFAULT 0,
    completed_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    team_name TEXT,
    CONSTRAINT unique_subtask_date UNIQUE (subtask_id, todo_date)
);

CREATE INDEX IF NOT EXISTS idx_subtask_logs_query ON public.subtask_logs (todo_date, subtask_id);

-- 7. Create Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    description TEXT,
    user_id UUID REFERENCES public.users(id),
    user_name TEXT, -- Denormalized for quick display
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Row Level Security (RLS)

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 9. Task Access Policy
-- Chỉ những user có role = 'master' hoặc là assignee trong các subtasks của task đó mới được quyền xem/sửa.

-- Helper function to get current user role
DROP FUNCTION IF EXISTS public.get_current_user_role();
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text AS $$
  SELECT role::text FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- Policy for tasks: SELECT, INSERT, UPDATE, DELETE
DROP POLICY IF EXISTS "Task Access Policy" ON public.tasks;
CREATE POLICY "Task Access Policy" ON public.tasks
FOR ALL
USING (
  public.get_current_user_role() = 'master' 
  OR 
  EXISTS (
    SELECT 1 FROM public.subtasks s
    WHERE s.task_id = public.tasks.id
    AND (
      s.assignee = (auth.jwt() ->> 'email')
      OR
      s.assignee = (SELECT name FROM public.users WHERE id = auth.uid())
    )
  )
);

-- Policies for projects
DROP POLICY IF EXISTS "Allow read to everyone" ON public.projects;
CREATE POLICY "Allow read to everyone" ON public.projects FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow master to insert" ON public.projects;
CREATE POLICY "Allow master to insert" ON public.projects FOR INSERT WITH CHECK (public.check_is_master());
DROP POLICY IF EXISTS "Allow master to update" ON public.projects;
CREATE POLICY "Allow master to update" ON public.projects FOR UPDATE USING (public.check_is_master());
DROP POLICY IF EXISTS "Allow master to delete" ON public.projects;
CREATE POLICY "Allow master to delete" ON public.projects FOR DELETE USING (public.check_is_master());

-- Policies for teams
DROP POLICY IF EXISTS "Allow read to everyone" ON public.teams;
CREATE POLICY "Allow read to everyone" ON public.teams FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow master to insert" ON public.teams;
CREATE POLICY "Allow master to insert" ON public.teams FOR INSERT WITH CHECK (public.check_is_master());
DROP POLICY IF EXISTS "Allow master to update" ON public.teams;
CREATE POLICY "Allow master to update" ON public.teams FOR UPDATE USING (public.check_is_master());
DROP POLICY IF EXISTS "Allow master to delete" ON public.teams;
CREATE POLICY "Allow master to delete" ON public.teams FOR DELETE USING (public.check_is_master());

-- Policies for tags
DROP POLICY IF EXISTS "Allow read to everyone" ON public.tags;
CREATE POLICY "Allow read to everyone" ON public.tags FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow master to insert" ON public.tags;
CREATE POLICY "Allow master to insert" ON public.tags FOR INSERT WITH CHECK (public.check_is_master());
DROP POLICY IF EXISTS "Allow master to update" ON public.tags;
CREATE POLICY "Allow master to update" ON public.tags FOR UPDATE USING (public.check_is_master());
DROP POLICY IF EXISTS "Allow master to delete" ON public.tags;
CREATE POLICY "Allow master to delete" ON public.tags FOR DELETE USING (public.check_is_master());

-- Policies for audit_logs
DROP POLICY IF EXISTS "Allow read to everyone" ON public.audit_logs;
CREATE POLICY "Allow read to everyone" ON public.audit_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert to everyone" ON public.audit_logs;
CREATE POLICY "Allow insert to everyone" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- 10. Policies for users table
-- We separate SELECT to avoid recursion in subqueries.
-- Since SELECT is 'USING (true)', subqueries selecting from users inside other policies won't recurse.
DROP POLICY IF EXISTS "Users can see all other users" ON public.users;
CREATE POLICY "Users can see all other users" ON public.users
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
CREATE POLICY "Users can insert their own profile" ON public.users
FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can edit their own profile" ON public.users;
CREATE POLICY "Users can edit their own profile" ON public.users
FOR UPDATE USING (auth.uid() = id);

-- Helper function to check if master safely
DROP FUNCTION IF EXISTS public.check_is_master();
CREATE OR REPLACE FUNCTION public.check_is_master()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role::text = 'master'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Master/Admin policy for managing other users (INSERT, UPDATE, DELETE only to avoid SELECT recursion)
DROP POLICY IF EXISTS "Master manage all users" ON public.users;
CREATE POLICY "Master insert" ON public.users FOR INSERT WITH CHECK (public.check_is_master());
CREATE POLICY "Master update" ON public.users FOR UPDATE USING (public.check_is_master());
CREATE POLICY "Master delete" ON public.users FOR DELETE USING (public.check_is_master());

-- Functions & Triggers for updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
EXCEPTION WHEN duplicate_function THEN NULL; END;
$$ language 'plpgsql';

-- 11. Enable Realtime (Idempotent)
DO $$
BEGIN
    -- This section ensures the publication exists and tables are added.
    -- Note: This is an example approach, some Supabase environments handle this differently.
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    -- Add tables safely
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.tags;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.subtasks;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.task_logs;
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.subtask_logs;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 12. Create Approve Tasks Table
CREATE TABLE IF NOT EXISTS public.approve_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description JSONB NOT NULL, -- stores the TaskMetadata serialized as JSON
    task_type TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    est_time INTEGER DEFAULT 0,
    actual_time INTEGER DEFAULT 0,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    reject_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Disable RLS to match other unrestricted tables
ALTER TABLE public.approve_tasks DISABLE ROW LEVEL SECURITY;

-- Enable Realtime for approve_tasks
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.approve_tasks;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 13. Historical Snapshot Upgrades for Completed/Skipped Days
-- Thêm các cột lưu snapshot thông tin Task lúc hoàn thành (Done/Skip)
ALTER TABLE public.task_logs ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.task_logs ADD COLUMN IF NOT EXISTS project_name TEXT;
ALTER TABLE public.task_logs ADD COLUMN IF NOT EXISTS tag_name TEXT;
ALTER TABLE public.task_logs ADD COLUMN IF NOT EXISTS deadline_time TEXT;
ALTER TABLE public.task_logs ADD COLUMN IF NOT EXISTS deadline_days TEXT;
ALTER TABLE public.task_logs ADD COLUMN IF NOT EXISTS task_type TEXT;
ALTER TABLE public.task_logs ADD COLUMN IF NOT EXISTS est_time INTEGER;

-- Thêm các cột lưu snapshot thông tin Subtask lúc hoàn thành
ALTER TABLE public.subtask_logs ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE public.subtask_logs ADD COLUMN IF NOT EXISTS assignee TEXT;
ALTER TABLE public.subtask_logs ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;

-- Đổi ràng buộc khóa ngoại subtask_id trong subtask_logs từ ON DELETE CASCADE thành ON DELETE SET NULL
-- Để khi admin xóa subtask trong bản mẫu, dữ liệu lịch sử log của subtask tại ngày đó vẫn còn nguyên giá trị snapshot.
DO $$
BEGIN
    ALTER TABLE public.subtask_logs DROP CONSTRAINT IF EXISTS subtask_logs_subtask_id_fkey;
    ALTER TABLE public.subtask_logs ADD CONSTRAINT subtask_logs_subtask_id_fkey 
      FOREIGN KEY (subtask_id) REFERENCES public.subtasks(id) ON DELETE SET NULL;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- Backfill dữ liệu lịch sử cho các dòng cũ của task_logs và subtask_logs từ bản mẫu hiện tại một cách an toàn thông qua Dynamic SQL
DO $$
DECLARE
    v_title_col TEXT := 'title';
    v_type_col TEXT := 'type';
    v_deadline_days_type TEXT;
    v_sql TEXT;
BEGIN
    -- 1. Kiểm tra cột chứa tiêu đề task (title hoặc task_name)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'task_name'
    ) THEN
        v_title_col := 'task_name';
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'title'
    ) THEN
        v_title_col := 'title';
    END IF;

    -- 2. Kiểm tra cột loại task (type hoặc task_type)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'task_type'
    ) THEN
        v_type_col := 'task_type';
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'type'
    ) THEN
        v_type_col := 'type';
    END IF;

    -- 3. Kiểm tra kiểu dữ liệu của deadline_days (text hoặc text[])
    SELECT data_type INTO v_deadline_days_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'deadline_days';

    -- 4. Tạo và thực thi câu lệnh SQL UPDATE động cho task_logs
    v_sql := 'UPDATE public.task_logs tl SET ' ||
             '  title = COALESCE(tl.title, t.' || quote_ident(v_title_col) || '), ' ||
             '  project_name = COALESCE(tl.project_name, t.project_name, ''''), ' ||
             '  tag_name = COALESCE(tl.tag_name, t.tag_name, ''''), ' ||
             '  deadline_time = COALESCE(tl.deadline_time, t.deadline_time::text, ''17:00''), ';

    IF v_deadline_days_type = 'ARRAY' THEN
        v_sql := v_sql || '  deadline_days = COALESCE(tl.deadline_days, array_to_string(t.deadline_days, '','')), ';
    ELSE
        v_sql := v_sql || '  deadline_days = COALESCE(tl.deadline_days, t.deadline_days::text), ';
    END IF;

    v_sql := v_sql || 
             '  task_type = COALESCE(tl.task_type, t.' || quote_ident(v_type_col) || '::text), ' ||
             '  est_time = COALESCE( ' ||
             '    tl.est_time, ' ||
             '    ( ' ||
             '      SELECT COALESCE(SUM(st.estimated_minutes), 0) ' ||
             '      FROM public.subtasks st ' ||
             '      WHERE st.task_id = tl.task_id ' ||
             '    ) ' ||
             '  ) ' ||
             'FROM public.tasks t ' ||
             'WHERE tl.task_id = t.id ' ||
             '  AND tl.title IS NULL;';

    EXECUTE v_sql;

    -- 5. Backfill cho subtask_logs
    UPDATE public.subtask_logs sl
    SET
      content = COALESCE(sl.content, s.content, ''),
      assignee = COALESCE(sl.assignee, s.assignee, ''),
      estimated_minutes = COALESCE(sl.estimated_minutes, s.estimated_minutes, 0)
    FROM public.subtasks s
    WHERE sl.subtask_id = s.id
      AND sl.content IS NULL;

END $$;


