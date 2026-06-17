import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, RotateCcw, Plus, Trash2, Power, Clock, Download, 
  ChevronLeft, ChevronRight, Edit2, MoreHorizontal, X, HelpCircle,
  Building, Briefcase, Tag, Users, Check, AlertCircle, FileSpreadsheet, Loader2, History, ChevronDown, ChevronUp
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import CreateTaskModal from '../components/CreateTaskModal';
import CreateApproveTaskModal from '../components/CreateApproveTaskModal';
import { FilterSelect } from '../components/ui/FilterSelect';
import { SearchableFilterSelect } from '../components/ui/SearchableFilterSelect';
import { MultiTeamFilterSelect } from '../components/ui/MultiTeamFilterSelect';
import { toast } from 'sonner';
import { useAppStore } from '../types';
import { logger } from '../lib/logger';
import { getTaskTeams as getTaskTeamsShared } from '../lib/utils';

// Definition of SubTask interface matching mockup
interface SubTask {
  id: string;
  content: string;
  assignee: string;
  estimated_minutes: number;
}

// Definition of metadata stored as robust JSON inside standard 'description' column
interface TaskMetadata {
  project_name: string;
  team_name: string;
  tag_name: string;
  note: string;
  versions?: any[];
}

// Database schema representation
interface DbTask {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  status: string; // 'ON' / 'OFF' for template switch
  is_active: boolean;
  est_time: number;
  actual_time: number;
  created_at: string;
  display_id?: number | null;
}

interface DbApproveTask {
  id: string;
  title: string;
  description: string | any;
  task_type: string;
  status: string; // 'PENDING' | 'REJECTED'
  est_time: number;
  actual_time: number;
  user_id?: string;
  reject_reason?: string | null;
  created_at: string;
  display_id?: number | null;
}

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

const formatDisplayDate = (str?: string): string => {
  if (!str) return '';
  const trimmed = str.trim();
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

const formatDateTime = (isoString?: string): string => {
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

// Helper to parse complex data out of standard 'description' column
const parseTaskDescription = (rawDescription: any): TaskMetadata => {
  const defaultMeta: TaskMetadata = {
    project_name: '',
    team_name: '',
    tag_name: '',
    note: '',
    versions: []
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

// Helper to serialize metadata back into description column
const serializeTaskDescription = (metadata: TaskMetadata): any => {
  return metadata;
};

const TaskManager: React.FC = () => {
  const { 
    showConfirm,
    tasks,
    setTasks,
    projectsList,
    teamsList,
    tagsList,
    assigneesList,
    usersFullList,
    metadataLoaded,
    tasksLoaded,
    tasksLoading,
    fetchTasks,
    fetchMetadata,
    setActiveTab,
    approveTasks,
    fetchApproveTasks
  } = useAppStore();
  const { currentUser, profile } = useAuthStore();
  const activeUser = currentUser || profile;
  const userRole = (activeUser?.role || 'user').toString().toLowerCase().trim();
  const isUser = userRole === 'user' || activeUser?.role === 'User';
  const isMaster = userRole === 'master';

  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  
  // Loading state using global caching system to prevent blank flashes when switching tabs
  const loading = !tasksLoaded && tasksLoading;
  
  // Filtering & Pagination State (with sessionStorage persistence)
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem('mgr_searchQuery') || '');
  const [filterPersonnel, setFilterPersonnel] = useState(() => {
    const stored = sessionStorage.getItem('mgr_filterPersonnel');
    if (stored !== null) return stored;
    return useAuthStore.getState().profile?.name || '';
  });
  const [filterTag, setFilterTag] = useState(() => sessionStorage.getItem('mgr_filterTag') || '');
  const [filterProject, setFilterProject] = useState(() => sessionStorage.getItem('mgr_filterProject') || '');
  const [filterTeam, setFilterTeam] = useState(() => sessionStorage.getItem('mgr_filterTeam') || '');
  const selectedTeams = useMemo(() => {
    return filterTeam ? filterTeam.split(',').filter(Boolean) : [];
  }, [filterTeam]);
  const [filterStatus, setFilterStatus] = useState(() => {
    const stored = sessionStorage.getItem('mgr_filterStatus');
    if (stored !== null) return stored;
    return 'ON';
  });

  const [filterTaskType, setFilterTaskType] = useState(() => sessionStorage.getItem('mgr_filterTaskType') || '');
  const selectedTaskTypes = useMemo(() => {
    return filterTaskType ? filterTaskType.split(',').filter(Boolean) : [];
  }, [filterTaskType]);

  useEffect(() => {
    sessionStorage.setItem('mgr_searchQuery', searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    sessionStorage.setItem('mgr_filterPersonnel', filterPersonnel);
  }, [filterPersonnel]);

  useEffect(() => {
    sessionStorage.setItem('mgr_filterTag', filterTag);
  }, [filterTag]);

  useEffect(() => {
    sessionStorage.setItem('mgr_filterProject', filterProject);
  }, [filterProject]);

  useEffect(() => {
    sessionStorage.setItem('mgr_filterTeam', filterTeam);
  }, [filterTeam]);

  useEffect(() => {
    sessionStorage.setItem('mgr_filterStatus', filterStatus);
  }, [filterStatus]);

  useEffect(() => {
    sessionStorage.setItem('mgr_filterTaskType', filterTaskType);
  }, [filterTaskType]);
  
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Drawer Panel & Modal view states
  const [openedDrawerTask, setOpenedDrawerTask] = useState<DbTask | null>(null);
  const [drawerTab, setDrawerTab] = useState<'details' | 'history'>('details');
  const [expandedVersions, setExpandedVersions] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (openedDrawerTask) {
      setDrawerTab('details');
    }
  }, [openedDrawerTask]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTask, setModalTask] = useState<DbTask | null>(null); // Null for create view, populated for edit view
  const [taskToClone, setTaskToClone] = useState<DbTask | null>(null);

  // Quick Approve states
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [approveTaskToClone, setApproveTaskToClone] = useState<DbApproveTask | null>(null);
  const [approveOriginalTaskId, setApproveOriginalTaskId] = useState<string | null>(null);

  // Action Menu dropdown state for specific task action buttons
  const [activeMenuTaskId, setActiveMenuTaskId] = useState<string | null>(null);

  // Pending edit approve_tasks caching lists
  const pendingEditTaskIds = useMemo(() => {
    const ids = new Set<string>();
    approveTasks.forEach(req => {
      let originalTaskId: string | null = null;
      const desc = req.description;
      if (desc) {
        if (typeof desc === 'object') {
          originalTaskId = desc.original_task_id || null;
        } else if (typeof desc === 'string') {
          const trimmed = desc.trim();
          if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
              const parsed = JSON.parse(trimmed);
              originalTaskId = parsed.original_task_id || null;
            } catch {
              // ignore
            }
          }
        }
      }
      if (originalTaskId) {
        ids.add(originalTaskId);
      }
    });
    return ids;
  }, [approveTasks]);

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

  // Fetch all tasks and metadata calling global store transitions
  const loadTasks = async () => {
    await fetchTasks(true);
  };

  useEffect(() => {
    // Run silent background fetches to guarantee data freshness
    fetchTasks();
    fetchMetadata();
    fetchApproveTasks();
  }, []);

  // Compute parsed tasks incorporating their JSON descriptions
  const parsedTasks = useMemo(() => {
    return tasks.map(task => {
      const meta = parseTaskDescription(task.description);
      return {
        ...task,
        id: task.id,
        title: task.title || '',
        task_type: task.task_type || '',
        status: task.status || 'ON',
        is_active: task.is_active ?? true,
        est_time: task.est_time || 0,
        actual_time: task.actual_time || 0,
        created_at: task.created_at,
        display_id: task.display_id,
        meta,
        project_name: meta.project_name || '',
        team_name: meta.team_name || '',
        tag_name: meta.tag_name || '',
        deadline_time: task.deadline_time ? (task.deadline_time.slice(0, 5)) : '',
        deadline_days: task.deadline_days || '',
        sub_tasks: (task.subtasks && task.subtasks.length > 0)
          ? task.subtasks.map((st: any) => ({
              id: st.id,
              content: st.content || '',
              assignee: st.assignee || '',
              estimated_minutes: st.estimated_minutes || 0
            }))
          : [],
        last_updated_by: '',
        last_updated_at: ''
      };
    });
  }, [tasks]);

  // Extract option lists for filters dynamically based on existing records
  const dynamicPersonnel = useMemo(() => {
    if (selectedTeams.length > 0) {
      return assigneesList.filter(person => {
        const teams = userToTeamsMap[person] || [];
        return teams.some(t => selectedTeams.includes(t));
      });
    }
    return assigneesList;
  }, [assigneesList, selectedTeams, userToTeamsMap]);

  const dynamicTags = useMemo(() => {
    return tagsList;
  }, [tagsList]);

  const dynamicProjects = useMemo(() => {
    return projectsList;
  }, [projectsList]);

  const dynamicTeams = useMemo(() => {
    return teamsList;
  }, [teamsList]);

  const isDefaultFilters = useMemo(() => {
    const defaultPersonnel = profile?.name || activeUser?.name || '';
    return (
      searchQuery === '' &&
      filterPersonnel === defaultPersonnel &&
      filterTag === '' &&
      filterProject === '' &&
      filterTeam === '' &&
      filterStatus === 'ON' &&
      filterTaskType === ''
    );
  }, [searchQuery, filterPersonnel, filterTag, filterProject, filterTeam, filterStatus, filterTaskType, profile?.name, activeUser?.name]);

  // Filter the parsed tasks based on current UI filtration values
  const filteredTasks = useMemo(() => {
    return parsedTasks.filter(task => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const displayId = getDisplayId(task);
        const matchTitle = (task.title || '').toLowerCase().includes(query);
        const matchId = displayId.includes(query);
        if (!matchTitle && !matchId) return false;
      }

      // 2. Personnel
      if (filterPersonnel) {
        const hasPersonnel = task.sub_tasks.some(s => s.assignee === filterPersonnel);
        if (!hasPersonnel) return false;
      }

      // 3. Tag Filter
      if (filterTag && task.tag_name !== filterTag) return false;

      // 4. Project Filter
      if (filterProject && task.project_name !== filterProject) return false;

      // 5. Team Filter
      if (selectedTeams.length > 0) {
        const { allTeams } = getTaskTeams(task.sub_tasks, task.team_name);
        const hasMatchingTeam = allTeams.some(t => selectedTeams.includes(t));
        if (!hasMatchingTeam) return false;
      }

      // 5.5. Task Type Filter
      if (selectedTaskTypes.length > 0) {
        if (!selectedTaskTypes.includes((task.task_type || '').toUpperCase())) return false;
      }

      // 6. Status Filter ('ON', 'OFF')
      if (filterStatus) {
        if (task.status !== filterStatus) return false;
      }

      return true;
    });
  }, [parsedTasks, searchQuery, filterPersonnel, filterTag, filterProject, filterTeam, filterStatus, selectedTaskTypes, getTaskTeams]);

  // Handle client-side pagination
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

  // Update specific task status switcher (ON/OFF)
  const handleToggleStatus = async (task: DbTask, currentStatus: string) => {
    const nextStatus = currentStatus === 'ON' ? 'OFF' : 'ON';
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ 
          status: nextStatus,
          is_active: nextStatus === 'ON'
        })
        .eq('id', task.id);

      if (error) throw error;
      
      // Update local state smoothly
      setTasks(prev => prev.map(t => t.id === task.id ? { 
          ...t, 
          status: nextStatus,
          is_active: nextStatus === 'ON'
        } : t));

      // Update opened Drawer task too if active
      if (openedDrawerTask && openedDrawerTask.id === task.id) {
        setOpenedDrawerTask({
          ...openedDrawerTask,
          status: nextStatus,
          is_active: nextStatus === 'ON'
        });
      }

      // Record audit log for activate/deactivate task template
      await logger.log(
        nextStatus === 'ON' ? 'ACTIVATE_TASK_TEMPLATE' : 'DEACTIVATE_TASK_TEMPLATE',
        `Toggled task status to ${nextStatus} for task template [${getDisplayId(task)}]: ${task.title || 'Untitled'}`,
        { taskId: task.id, status: nextStatus }
      );

      toast.success(`Successfully updated task status to ${nextStatus}!`);
    } catch (err: any) {
      console.error('Error toggling task status:', err);
      toast.error(`Could not change status: ${err.message}`);
    }
  };

  // Delete a task permanently from supabase without RLS
  const handleDeleteTask = async (taskId: string) => {
    if (!isMaster) {
      toast.error("Only Master account can delete task templates.");
      return;
    }

    const taskToDelete = tasks.find(t => t.id === taskId);
    const taskTitle = taskToDelete?.title || 'Untitled';
    const taskDisplayId = taskToDelete ? getDisplayId(taskToDelete) : taskId;

    showConfirm({
      title: "Confirm Permanent Deletion",
      message: `Are you sure you want to permanently delete task template [${taskDisplayId}]: "${taskTitle}"? This action is irreversible.`,
      confirmText: "Permanently Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        setDeletingTaskId(taskId);
        try {
          const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', taskId);

          if (error) throw error;
          
          // Record audit log for deleting task template
          await logger.log(
            'DELETE_TASK_TEMPLATE',
            `Permanently deleted task template [${taskDisplayId}]: ${taskTitle}`,
            { taskId }
          );

          // Sync state and close elements
          setTasks(prev => prev.filter(t => t.id !== taskId));
          if (openedDrawerTask && openedDrawerTask.id === taskId) {
            setOpenedDrawerTask(null);
          }
          setActiveMenuTaskId(null);
          toast.success("Task template deleted successfully!");
        } catch (err: any) {
          console.error('Error deleting task:', err);
          toast.error(`Could not delete task: ${err.message}`);
        } finally {
          setDeletingTaskId(null);
        }
      }
    });
  };

  // Open Modal in Edit Mode
  const handleOpenEditModal = (task: DbTask) => {
    setModalTask(task);
    setTaskToClone(null);
    setIsModalOpen(true);
    setOpenedDrawerTask(null); // Close sidebar drawer when editing
    setActiveMenuTaskId(null);
  };

  // Open Modal in Create Mode
  const handleOpenCreateModal = () => {
    setModalTask(null);
    setTaskToClone(null);
    setIsModalOpen(true);
    setActiveMenuTaskId(null);
  };

  // Open Modal in Quick Create (Clone) Mode
  const handleOpenCloneModal = (task: DbTask) => {
    setModalTask(null);
    setTaskToClone(task);
    setIsModalOpen(true);
    setOpenedDrawerTask(null);
    setActiveMenuTaskId(null);
  };

  // State for tracking which task is currently being Quick Approved
  const [quickApprovingId, setQuickApprovingId] = useState<string | null>(null);

  const handleQuickApprove = (task: DbTask) => {
    const meta = parseTaskDescription(task.description) as any;
    // Update last updated info
    meta.last_updated_by = profile?.name || 'Unknown';
    meta.last_updated_at = new Date().toISOString();

    const tempApproveTask: DbApproveTask = {
      id: task.id,
      title: task.title,
      description: meta,
      task_type: task.task_type,
      status: 'PENDING',
      est_time: task.est_time,
      actual_time: task.actual_time,
      user_id: profile?.id || undefined,
      created_at: new Date().toISOString()
    };

    setApproveTaskToClone(tempApproveTask);
    setIsApproveModalOpen(true);
    setOpenedDrawerTask(null);
    setActiveMenuTaskId(null);
  };

  const handleOpenApproveEditModal = (task: DbTask) => {
    const meta = parseTaskDescription(task.description) as any;
    // Update last updated info
    meta.last_updated_by = profile?.name || 'Unknown';
    meta.last_updated_at = new Date().toISOString();

    const tempApproveTask: DbApproveTask = {
      id: task.id,
      title: task.title,
      description: meta,
      task_type: task.task_type,
      status: 'PENDING',
      est_time: task.est_time,
      actual_time: task.actual_time,
      user_id: profile?.id || undefined,
      created_at: new Date().toISOString()
    };

    setApproveTaskToClone(tempApproveTask);
    setApproveOriginalTaskId(task.id);
    setIsApproveModalOpen(true);
    setOpenedDrawerTask(null);
    setActiveMenuTaskId(null);
  };

  // Export current list to CSV
  const handleExportCsv = () => {
    if (filteredTasks.length === 0) return;
    
    // Header setup
    const headers = [
      'ID', 
      'TASK NAME', 
      'PROJECT', 
      'TAG', 
      'TEAM', 
      'TYPE', 
      'TYPE DETAIL', 
      'DEADLINE TIME', 
      'EST TIME', 
      'STATUS', 
      'NOTE',
      'SUBTASK CONTENT', 
      'ASSIGNEE', 
      'LASTUPDATED USER', 
      'LASTUPDATED TIME'
    ];

    const csvContent = [
      headers.join(','),
      ...filteredTasks.map(task => {
        const subtasks = task.sub_tasks || [];
        const subContent = subtasks.map((s: any) => s.content || '').filter(Boolean).join(', ');
        const subAssignees = subtasks.map((s: any) => s.assignee || '').filter(Boolean).filter((val: string, i: number, arr: string[]) => arr.indexOf(val) === i).join(', ');

        const updatedUser = (task as any).last_updated_by || 'Unknown';
        const updatedTime = formatDateTime(task.created_at || task.updated_at);

        return [
          `"\t${getDisplayId(task)}"`,
          `"${(task.title || '').replace(/"/g, '""')}"`,
          `"${(task.project_name || '').replace(/"/g, '""')}"`,
          `"${(task.tag_name || '').replace(/"/g, '""')}"`,
          `"${(getTaskTeams(task.sub_tasks, task.team_name).allTeams.join(', ') || 'No Team').replace(/"/g, '""')}"`,
          `"${task.task_type || ''}"`,
          `"${(task.deadline_days || '').replace(/"/g, '""')}"`,
          `"${task.deadline_time || ''}"`,
          `"${task.est_time || 0}m"`,
          `"${task.status || 'ON'}"`,
          `"${(task.meta?.note || '').replace(/"/g, '""')}"`,
          `"${subContent.replace(/"/g, '""')}"`,
          `"${subAssignees.replace(/"/g, '""')}"`,
          `"${updatedUser.replace(/"/g, '""')}"`,
          `"${updatedTime}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `dymtask_manager_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculated dynamic state of Drawer
  const drawerParsedMeta = useMemo(() => {
    if (!openedDrawerTask) return null;
    return parseTaskDescription(openedDrawerTask.description);
  }, [openedDrawerTask]);

  const historyVersions = useMemo(() => {
    return drawerParsedMeta?.versions || [];
  }, [drawerParsedMeta]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white overflow-x-auto relative font-sans">
      
      {/* 1. Header Filter & Actions Controls */}
      {/* 1. Actions Header toolbar */}
      <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex items-center justify-between gap-4 flex-nowrap overflow-visible relative z-[40] min-w-[1350px] w-full mb-0">
        <div className="flex items-center gap-2 shrink-0 flex-nowrap">
          {/* Search task */}
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

          {/* Filter Personnel */}
          <SearchableFilterSelect 
            value={filterPersonnel}
            onChange={(val) => {
              setFilterPersonnel(val);
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
            options={dynamicPersonnel.map(person => ({ value: person, label: person }))}
            className="w-[190px] min-w-[190px] max-w-[190px]"
          />

          {/* Filter All Projects */}
          <FilterSelect 
            value={filterProject}
            onChange={(val) => {
              setFilterProject(val);
              setPage(1);
            }}
            defaultOptionLabel="Projects"
            options={dynamicProjects.map(proj => ({ value: proj, label: proj }))}
            className="w-[190px] min-w-[190px] max-w-[190px]"
          />

          {/* Filter All Tags */}
          <FilterSelect 
            value={filterTag}
            onChange={(val) => {
              setFilterTag(val);
              setPage(1);
            }}
            defaultOptionLabel="Tags"
            options={dynamicTags.map(tag => ({ value: tag, label: tag }))}
            className="w-[120px] min-w-[120px] max-w-[120px]"
          />

          {/* Filter All Teams */}
          <MultiTeamFilterSelect 
            value={filterTeam}
            onChange={(val) => {
              setFilterTeam(val);
              setPage(1);
              const nextSelected = val.split(',').filter(Boolean);
              if (filterPersonnel && nextSelected.length > 0) {
                const companionTeams = userToTeamsMap[filterPersonnel] || [];
                const hasMatch = companionTeams.some(t => nextSelected.includes(t));
                if (!hasMatch) {
                  setFilterPersonnel('');
                }
              }
            }}
            defaultOptionLabel="Teams"
            options={dynamicTeams.map(tm => ({ value: tm, label: tm }))}
            className="w-[120px] min-w-[120px] max-w-[120px]"
          />

          {/* Filter Task Type */}
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
            className="w-[100px] min-w-[100px] max-w-[100px]"
          />

          {/* Filter Status (ON/OFF) */}
          <FilterSelect 
            value={filterStatus}
            onChange={(val) => {
              setFilterStatus(val);
              setPage(1);
            }}
            defaultOptionLabel="Status"
            options={[
              { value: 'ON', label: 'On' },
              { value: 'OFF', label: 'Off' }
            ]}
            className="w-[120px] min-w-[120px] max-w-[120px]"
          />

          {/* Reset Filters button */}
          {!isDefaultFilters && (
            <button 
              onClick={() => {
                setSearchQuery('');
                setFilterPersonnel(profile?.name || activeUser?.name || '');
                setFilterTag('');
                setFilterProject('');
                setFilterTeam('');
                setFilterStatus('ON');
                setFilterTaskType('');
                setPage(1);
              }}
              className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
              title="Reset filters"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>

        {/* Create and CSV action triggers */}
        <div className="flex items-center gap-2 shrink-0">
          {!isUser && (
            <button 
              onClick={handleOpenCreateModal}
              className="flex items-center gap-1.5 px-2 h-8 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white rounded-md text-xs font-medium shadow-sm"
            >
              <Plus size={14} />
              <span>Create</span>
            </button>
          )}
          <button 
            onClick={handleExportCsv}
            disabled={filteredTasks.length === 0}
            className="h-8 px-2 flex items-center gap-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-md transition-colors disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Export</span>
          </button>
        </div>
      </div>

      {/* 2. Main High-Polished Grid/Table Grid Panel */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white min-h-[400px] min-w-[1350px] w-full">
        {loading ? (
          <div className="h-full w-full flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-slate-400 font-medium animate-pulse">Loading templates...</p>
          </div>
        ) : paginatedTasks.length > 0 ? (
          <table className="w-full text-left border-collapse table-fixed select-none min-w-[1350px]">
            <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-20">
              <tr className="h-8">
                <th className="w-[5%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Id</th>
                <th className="w-[18%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Task Name</th>
                <th className="w-[11%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Project</th>
                <th className="w-[7%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Tag</th>
                <th className="w-[6%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Team</th>
                <th className="w-[6%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center bg-slate-100">Type</th>
                <th className="w-[12%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Type Detail</th>
                <th className="w-[12%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Deadline</th>
                <th className="w-[12%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center bg-slate-100">Est. min</th>
                <th className="w-[5%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center bg-slate-100">Status</th>
                <th className="w-[6%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center bg-slate-100">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y premium-divide">
              {paginatedTasks.map((task) => (
                <tr 
                  key={task.id} 
                  className="h-[46px] hover:bg-slate-50/50 transition-colors group cursor-pointer"
                  onClick={() => setOpenedDrawerTask(task)}
                >
                  {/* ID */}
                  <td className="px-3 py-1.5">
                    <span className="font-mono text-xs text-slate-400 font-medium">
                      {getDisplayId(task)}
                    </span>
                  </td>

                  {/* Task Name */}
                  <td className="px-3 py-1.5 overflow-hidden">
                    <span className="font-medium text-slate-700 text-xs truncate block" title={task.title || ''}>
                      {task.title}
                    </span>
                  </td>

                  {/* Project */}
                  <td className="px-3 py-1.5 overflow-hidden">
                    <span className="text-slate-600 text-xs truncate block font-normal" title={task.project_name || '【事務代行】HR TECH'}>
                      {task.project_id ? (projectsList.find((p: any) => p === task.project_name) || task.project_name) : task.project_name}
                    </span>
                  </td>

                  {/* Tag */}
                  <td className="px-3 py-1.5 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <span className="inline-block bg-slate-50 border border-slate-100 px-2 py-0.5 rounded text-xs text-slate-600 truncate max-w-full font-medium">
                      {task.tag_name || '求人更新'}
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

                  {/* Type */}
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

                  {/* Deadline text output */}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Clock size={12} className="text-slate-400 shrink-0" />
                      <span className="truncate">
                        {task.deadline_time || '17:00'}
                      </span>
                    </div>
                  </td>

                  {/* Estimated minutes */}
                  <td className="px-3 py-1.5 text-center" onClick={(e) => { e.stopPropagation(); setOpenedDrawerTask(task); }}>
                    <span className="text-indigo-600 hover:text-indigo-800 font-medium font-mono text-xs cursor-pointer">
                      {task.est_time || 0}m
                    </span>
                  </td>

                  {/* Status Switch (ON/OFF) Toggle Pill - Label Chỉ đọc dạng Dot */}
                  <td className="px-3 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1.5 select-none" title={isUser ? undefined : "Switch operational status in the Actions menu"}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${task.status === 'ON' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <span className="text-xs text-slate-600 font-medium font-sans">
                        {task.status === 'ON' ? 'On' : 'Off'}
                      </span>
                    </div>
                  </td>

                  {/* Actions dropdown button */}
                  <td className="px-3 py-1.5 text-center relative" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => setActiveMenuTaskId(activeMenuTaskId === task.id ? null : task.id)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      <MoreHorizontal size={14} />
                    </button>

                    {/* Quick action floating menu context popup */}
                    {activeMenuTaskId === task.id && (
                      <div className="absolute right-3 top-8 bg-white border border-slate-200 rounded-md shadow-lg py-1 z-[100] w-[150px]">
                        {isUser ? (
                          pendingEditTaskIds.has(task.id) ? (
                            <button
                              disabled
                              className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-400 opacity-60 flex items-center gap-2 cursor-not-allowed"
                              title="The request is currently pending approval"
                            >
                              <Clock size={12} className="text-slate-400" />
                              <span>Pending</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenApproveEditModal(task)}
                              className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                            >
                              <Edit2 size={12} className="text-slate-400" />
                              <span>Approve Edit</span>
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => handleOpenEditModal(task)}
                            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <Edit2 size={12} className="text-slate-400" />
                            <span>Edit template</span>
                          </button>
                        )}

                        {isUser ? (
                          <button
                            disabled={quickApprovingId === task.id}
                            onClick={() => handleQuickApprove(task)}
                            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            {quickApprovingId === task.id ? (
                              <Loader2 size={12} className="text-emerald-500 animate-spin" />
                            ) : (
                              <Plus size={12} className="text-emerald-500" />
                            )}
                            <span>Quick Approve</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenCloneModal(task)}
                            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                          >
                            <Plus size={12} className="text-emerald-500" />
                            <span>Quick Create</span>
                          </button>
                        )}
                        
                        {!isUser && (
                          <>
                            <hr className="my-1 border-slate-100" />
                            <button
                               onClick={() => {
                                 if (task.task_type === 'ONETIME' && task.status === 'ON') {
                                   toast.error("Cannot turn off a ONETIME task from Task Manager (it is automatically turned off when submitted from the To-do List)");
                                   return;
                                 }
                                 handleToggleStatus(task, task.status);
                                 setActiveMenuTaskId(null);
                               }}
                               className={`w-full text-left px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer ${
                                 task.task_type === 'ONETIME' && task.status === 'ON'
                                   ? 'text-slate-300 cursor-not-allowed opacity-50'
                                   : 'text-slate-700 hover:bg-slate-50'
                               }`}
                               title={task.task_type === 'ONETIME' && task.status === 'ON' ? "Cannot turn off a ONETIME task from Task Manager" : ""}
                            >
                              <Power size={12} className={task.status === 'ON' ? "text-amber-500" : "text-emerald-500"} />
                              <span>{task.status === 'ON' ? 'Inactive task' : 'Activate task'}</span>
                            </button>
                            
                            {isMaster ? (
                              <>
                                <hr className="my-1 border-slate-100" />
                                <button
                                  onClick={() => handleDeleteTask(task.id)}
                                  disabled={deletingTaskId === task.id}
                                  className="w-full text-left px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
                                >
                                  {deletingTaskId === task.id ? (
                                    <Loader2 size={12} className="text-red-400 animate-spin" />
                                  ) : (
                                    <Trash2 size={12} className="text-red-400" />
                                  )}
                                  <span>{deletingTaskId === task.id ? 'Deleting...' : 'Delete'}</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <hr className="my-1 border-slate-100" />
                                <button
                                  disabled
                                  className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors flex items-center gap-2 cursor-not-allowed"
                                  title="Only Master can delete tasks"
                                >
                                  <Trash2 size={12} className="text-slate-300" />
                                  <span>Delete (Locked)</span>
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-24 flex flex-col items-center justify-center text-center">
            <div className="p-4 bg-slate-50 rounded-full mb-3 text-slate-300">
              <AlertCircle size={36} />
            </div>
            <h4 className="text-slate-800 font-bold text-sm">No Task Templates Available</h4>
            <p className="text-slate-400 text-xs mt-1 max-w-xs leading-relaxed">
              {isUser 
                ? "Contact your administrator or master to configure task templates." 
                : "Click \"+ Create task\" to start creating your first task template synced to Supabase."
              }
            </p>
          </div>
        )}
      </div>

      {/* 3. Footer Statistics and Client-side Page Navigator */}
      <div className="px-6 py-3 flex items-center justify-between border-t border-slate-100 bg-white shrink-0 selection:bg-none min-w-[1350px] w-full">
        <span className="text-xs font-semibold text-slate-400 font-mono">
          Total: {totalCount} templates | {totalSubtasksCount} subtasks
        </span>
        
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1.5">
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
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${
                    page === item 
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-100 cursor-default" 
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
              className="px-2.5 py-1.5 text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        <div className="w-20 hidden md:block"></div>
      </div>

      {/* 4. SIDE DRAWER: Details Display Panel (Opens from Right side) */}
      {openedDrawerTask && drawerParsedMeta && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop overlay */}
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity cursor-pointer animate-in fade-in duration-200" 
            onClick={() => setOpenedDrawerTask(null)}
          />
          {/* Drawer Panel Body container */}
          <div className="relative w-full max-w-[450px] bg-white h-full shadow-2xl flex flex-col z-10 border-l border-slate-100 animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-slate-400">Template details</span>
              <button 
                onClick={() => setOpenedDrawerTask(null)}
                className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tab Switcher */}
            <div className="flex border-b border-slate-100 shrink-0 bg-slate-50/50 p-1.5 gap-1 shadow-inner relative z-20">
              <button
                onClick={() => setDrawerTab('details')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  drawerTab === 'details'
                    ? 'bg-white text-indigo-600 shadow-xs border border-slate-100/80 font-bold'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/40'
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setDrawerTab('history')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  drawerTab === 'history'
                    ? 'bg-white text-indigo-600 shadow-xs border border-slate-100/80 font-bold'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/40'
                }`}
              >
                <span>History</span>
                {historyVersions.length > 0 && (
                  <span className={`px-1.5 py-0.2 text-[9px] rounded-full font-bold ${
                    drawerTab === 'history' ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200/85 text-slate-600'
                  }`}>
                    {historyVersions.length}
                  </span>
                )}
              </button>
            </div>

            {drawerTab === 'details' ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Task template heading with toggle switch */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800 leading-tight">{openedDrawerTask.title}</h2>
                  <span className="text-xs font-mono text-slate-400 mt-0.5 block">Id: {getDisplayId(openedDrawerTask)}</span>
                </div>
                <div className="inline-flex items-center gap-1.5 select-none">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${openedDrawerTask.status === 'ON' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span className="text-xs text-slate-600 font-medium font-sans">
                    {openedDrawerTask.status === 'ON' ? 'On' : 'Off'}
                  </span>
                </div>
              </div>

              {/* Tags info grid block */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-3 text-xs">
                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium block">Project</span>
                  <span className="text-slate-700 block text-xs font-semibold hover:text-indigo-600 cursor-pointer transition-colors truncate">{(openedDrawerTask as any).project_name || drawerParsedMeta.project_name}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium block">Tag</span>
                  <span className="text-slate-700 block text-xs truncate">{(openedDrawerTask as any).tag_name || drawerParsedMeta.tag_name}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium block">Team</span>
                  <span className="text-slate-700 block text-xs truncate">{getTaskTeams(openedDrawerTask.sub_tasks, (openedDrawerTask as any).team_name || drawerParsedMeta.team_name).display}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-slate-400 font-medium block">Frequency mode</span>
                  <span className="text-slate-700 block text-xs font-semibold">
                    {openedDrawerTask.task_type || 'DAILY'}
                  </span>
                  {openedDrawerTask.deadline_days && (
                    <span className="block text-[11px] text-slate-500 font-mono mt-0.5 leading-normal break-all">
                      ({formatDisplayDate(openedDrawerTask.deadline_days)})
                    </span>
                  )}
                </div>
              </div>

              {/* Note Display Section */}
              <div className="space-y-1 bg-slate-50 border border-slate-100/80 rounded-lg p-3 text-xs note-section-wrapper">
                <span className="text-slate-400 font-bold block uppercase tracking-wider text-[10px]">Note</span>
                <div className="mt-1">
                  {(() => {
                    const noteStr = drawerParsedMeta.note || '';
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
                          id="note_url_link"
                        >
                          <span>{trimmed}</span>
                        </a>
                      );
                    }
                    return <span className="text-slate-700 font-medium break-words note-text-content">{trimmed}</span>;
                  })()}
                </div>
              </div>

              {/* Sub-tasks management section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h3 className="text-xs font-semibold text-slate-500">Sub-tasks management</h3>
                  <span className="text-xs font-medium text-blue-600 font-mono">
                    Total est: {openedDrawerTask.est_time || 0} min
                  </span>
                </div>

                <div className="space-y-2">
                  {openedDrawerTask.sub_tasks && openedDrawerTask.sub_tasks.length > 0 ? (
                    openedDrawerTask.sub_tasks.map((sub, index) => (
                      <div 
                        key={sub.id || index} 
                        className="border border-slate-100 hover:border-blue-100 hover:bg-blue-50/10 transition-all rounded-lg p-3 bg-white flex flex-col justify-between gap-2 relative shadow-xs animate-in fade-in"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-slate-700 text-xs font-medium leading-normal">{sub.content}</span>
                          <span className="text-xs bg-slate-50 text-slate-500 border border-slate-100 rounded px-1.5 py-0.5 ml-auto shrink-0 font-medium">
                            {sub.assignee}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-50">
                          <div className="flex-1 bg-slate-50 border border-slate-100 rounded px-2 py-1 text-xs text-slate-400 flex items-center justify-between font-mono">
                            <span>Estimated</span>
                            <span className="text-slate-700 font-medium">{sub.estimated_minutes} min</span>
                          </div>
                          
                          <div className="border border-slate-100 rounded px-2 py-1 text-xs text-slate-400 shrink-0 font-mono text-center">
                            Template
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-6 border border-dashed border-slate-200 hover:border-blue-200 transition-all text-center rounded-xl text-slate-400 text-xs bg-slate-50/40">
                      No sub-tasks defined for this template.
                    </div>
                  )}
                </div>
              </div>
            </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {historyVersions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <History size={32} className="text-slate-300 stroke-[1.5] mb-2" />
                    <span className="text-xs font-semibold text-slate-500">No version history</span>
                    <p className="text-[11px] text-slate-400 max-w-[240px] mt-1 leading-normal">
                      This task has not been edited or versioned yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5 pr-0.5 animate-in fade-in duration-200">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Revision Timeline ({historyVersions.length})
                    </div>
                    
                    <div className="relative border-l-2 border-slate-200 pl-4 ml-1 space-y-5">
                      {historyVersions.map((v: any, idx: number) => {
                        const isExpanded = !!expandedVersions[idx];
                        const subtasksCount = v.sub_tasks?.length || 0;
                        return (
                          <div key={idx} className="relative">
                            {/* Dot indicator */}
                            <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-white border border-indigo-600 block shrink-0" />
                            
                            <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-xs hover:border-slate-300 transition-all">
                              {/* Validity and Version badge row */}
                              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-2 pb-1.5 border-b border-slate-100">
                                <span className="font-semibold text-slate-600 flex items-center gap-1">
                                  <Clock size={11} className="text-slate-400" />
                                  {formatDisplayDate(v.valid_from)} ~ {formatDisplayDate(v.valid_until)}
                                </span>
                                <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-bold border border-indigo-100">
                                  Rev #{historyVersions.length - idx}
                                </span>
                              </div>

                              {/* Title */}
                              <h3 className="text-xs font-bold text-slate-800 leading-snug break-words">
                                {v.title}
                              </h3>

                              {/* Tags Grid */}
                              <div className="grid grid-cols-2 gap-1.5 mt-2.5 text-[10px]">
                                <div className="text-slate-500 bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/50">
                                  <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider">Project</span>
                                  <span className="font-semibold text-slate-700 truncate block mt-0.5">{v.project_name || 'N/A'}</span>
                                </div>
                                <div className="text-slate-500 bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/50">
                                  <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider">Team</span>
                                  <span className="font-semibold text-slate-700 truncate block mt-0.5">{v.team_name || 'N/A'}</span>
                                </div>
                                <div className="text-slate-500 bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/50">
                                  <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider">Tag</span>
                                  <span className="font-semibold text-slate-700 truncate block mt-0.5">{v.tag_name || 'N/A'}</span>
                                </div>
                                <div className="text-slate-500 bg-slate-50/50 p-1.5 rounded-lg border border-slate-100/50">
                                  <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider">Deadline</span>
                                  <span className="font-semibold text-slate-700 truncate block mt-0.5">
                                    {v.deadline_time || '17:00'} ({formatDisplayDate(v.deadline_days)})
                                  </span>
                                </div>
                              </div>

                              {/* Note / Description */}
                              {v.description && (
                                <div className="mt-2.5 bg-slate-50 rounded p-2 text-[11px] text-slate-600 border border-slate-100 leading-normal whitespace-pre-wrap break-words">
                                  <span className="block text-[8px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">Link Note</span>
                                  {v.description}
                                </div>
                              )}

                              {/* Subtasks view */}
                              {subtasksCount > 0 && (
                                <div className="mt-3 pt-2.5 border-t border-slate-100">
                                  <button
                                    onClick={() => setExpandedVersions(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                    className="flex items-center justify-between w-full text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                                  >
                                    <span>Sub-tasks ({subtasksCount})</span>
                                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  </button>

                                  {isExpanded && (
                                    <div className="mt-2 space-y-1.5 animate-in fade-in duration-205">
                                      {v.sub_tasks.map((st: any, sIdx: number) => (
                                        <div key={sIdx} className="bg-slate-50 border border-slate-100 rounded-lg p-2 flex flex-col gap-1 text-[11px]">
                                          <div className="flex items-start justify-between gap-1.5">
                                            <span className="font-medium text-slate-700 break-words flex-1">{st.content}</span>
                                            {st.assignee && (
                                              <span className="bg-white border border-slate-200 text-slate-500 rounded px-1.5 py-0.2 shrink-0 font-medium scale-95">
                                                {st.assignee}
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-slate-400 font-mono flex justify-between pt-0.5 border-t border-slate-100/50">
                                            <span>Est duration:</span>
                                            <span className="font-semibold text-slate-650">{st.estimated_minutes} min</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bottom Edit Action Button replacement with 4 Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/75 shrink-0 space-y-2 template-actions-footer">
              <div className="grid grid-cols-2 gap-2">
                {/* 1. Edit Template / Approve Edit */}
                {isUser ? (
                  openedDrawerTask && pendingEditTaskIds.has(openedDrawerTask.id) ? (
                    <button 
                      disabled
                      className="h-9 bg-slate-100 border border-slate-200 text-slate-400 rounded text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm cursor-not-allowed"
                    >
                      <Clock size={13} />
                      <span>Pending</span>
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleOpenApproveEditModal(openedDrawerTask)}
                      className="h-9 bg-blue-600 hover:bg-blue-700 transition-all text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Edit2 size={13} />
                      <span>Approve Edit</span>
                    </button>
                  )
                ) : (
                  <button 
                    onClick={() => handleOpenEditModal(openedDrawerTask)}
                    className="h-9 bg-blue-600 hover:bg-blue-700 transition-all text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Edit2 size={13} />
                    <span>Edit template</span>
                  </button>
                )}

                {/* 2. Quick Create / Quick Approve */}
                {isUser ? (
                  <button
                    disabled={quickApprovingId === openedDrawerTask.id}
                    onClick={() => handleQuickApprove(openedDrawerTask)}
                    className="h-9 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-all text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    title="Send a clone of this task directly into the approval workflow"
                  >
                    {quickApprovingId === openedDrawerTask.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Plus size={13} />
                    )}
                    <span>Quick Approve</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleOpenCloneModal(openedDrawerTask)}
                    className="h-9 bg-emerald-600 hover:bg-emerald-700 transition-all text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>Quick Create</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* 3. Toggle Status (Active / Inactive) */}
                <button
                  disabled={isUser}
                  onClick={() => {
                    if (openedDrawerTask.task_type === 'ONETIME' && openedDrawerTask.status === 'ON') {
                      toast.error("Cannot turn off a ONETIME task from Task Manager");
                      return;
                    }
                    handleToggleStatus(openedDrawerTask, openedDrawerTask.status);
                  }}
                  className="h-9 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-slate-700 rounded text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-200 cursor-pointer"
                >
                  <Power size={13} className={openedDrawerTask.status === 'ON' ? "text-amber-500" : "text-emerald-500"} />
                  <span>{openedDrawerTask.status === 'ON' ? 'Inactive' : 'Activate'}</span>
                </button>

                {/* 4. Delete */}
                {isMaster ? (
                  <button
                    onClick={() => handleDeleteTask(openedDrawerTask.id)}
                    disabled={deletingTaskId === openedDrawerTask.id}
                    className="h-9 bg-red-50 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-all text-red-600 rounded text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {deletingTaskId === openedDrawerTask.id ? (
                      <Loader2 size={13} className="animate-spin text-red-500 font-bold" />
                    ) : (
                      <Trash2 size={13} className="text-red-500" />
                    )}
                    <span>Delete</span>
                  </button>
                ) : (
                  <button
                    disabled
                    className="h-9 bg-slate-100 border border-slate-205 text-slate-300 rounded text-xs font-semibold flex items-center justify-center gap-1.5 cursor-not-allowed"
                    title="Only Master can delete task templates"
                  >
                    <Trash2 size={13} className="text-slate-300" />
                    <span>Locked</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL OVERLAY: Create & Edit Template Task Modal */}
      <CreateTaskModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={() => {
          loadTasks();
          if (openedDrawerTask) {
            setOpenedDrawerTask(null);
          }
        }} 
        taskToEdit={modalTask} 
        taskToClone={taskToClone}
      />

      {/* 6. MODAL OVERLAY: Create Approve Task Modal */}
      <CreateApproveTaskModal
        isOpen={isApproveModalOpen}
        onClose={() => {
          setIsApproveModalOpen(false);
          setApproveTaskToClone(null);
          setApproveOriginalTaskId(null);
        }}
        onSuccess={() => {
          setIsApproveModalOpen(false);
          setApproveTaskToClone(null);
          setApproveOriginalTaskId(null);
          // Auto-navigate to approval workflow screen upon success
          setActiveTab('APPROVE TASK');
        }}
        taskToClone={approveTaskToClone}
        originalTaskId={approveOriginalTaskId}
      />
    </div>
  );
};

export default TaskManager;
