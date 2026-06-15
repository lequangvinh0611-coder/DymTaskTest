import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, RotateCcw, Plus, Trash2, Power, Clock, ChevronLeft, ChevronRight, 
  Edit2, MoreHorizontal, X, AlertCircle, Loader2, Check, Ban
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import CreateApproveTaskModal from '../components/CreateApproveTaskModal';
import { FilterSelect } from '../components/ui/FilterSelect';
import { SearchableFilterSelect } from '../components/ui/SearchableFilterSelect';
import { MultiTeamFilterSelect } from '../components/ui/MultiTeamFilterSelect';
import { toast } from 'sonner';
import { useAppStore } from '../types';
import { logger } from '../lib/logger';

interface SubTask {
  id: string;
  content: string;
  assignee: string;
  estimated_minutes: number;
}

interface TaskMetadata {
  description: string;
  project_name: string;
  team_name: string;
  tag_name: string;
  deadline_time: string;
  deadline_days: string;
  sub_tasks: SubTask[];
  note?: string;
  last_updated_by?: string;
  last_updated_at?: string;
  original_task_id?: string | null;
  onetime_targets?: any[];
  completions?: any;
  versions?: any[];
}

interface DbApproveTask {
  id: string;
  title: string;
  description: any;
  task_type: string;
  status: string; // 'PENDING' | 'REJECTED'
  est_time: number;
  actual_time: number;
  user_id?: string;
  reject_reason?: string | null;
  created_at: string;
  display_id?: number | null;
}

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

const parseTaskDescription = (rawDescription: any): TaskMetadata => {
  const defaultMeta: TaskMetadata = {
    description: '',
    project_name: '',
    team_name: '',
    tag_name: '',
    deadline_time: '17:00',
    deadline_days: 'Mon - Fri',
    sub_tasks: [],
    note: '',
    last_updated_by: '',
    last_updated_at: '',
    onetime_targets: [],
    completions: {},
    versions: []
  };

  if (!rawDescription) return defaultMeta;

  if (typeof rawDescription === 'object') {
    return {
      description: rawDescription.description || '',
      project_name: rawDescription.project_name || '',
      team_name: rawDescription.team_name || '',
      tag_name: rawDescription.tag_name || '',
      deadline_time: rawDescription.deadline_time || '17:00',
      deadline_days: rawDescription.deadline_days || 'Mon - Fri',
      sub_tasks: Array.isArray(rawDescription.sub_tasks) ? rawDescription.sub_tasks : [],
      note: rawDescription.note || '',
      last_updated_by: rawDescription.last_updated_by || '',
      last_updated_at: rawDescription.last_updated_at || '',
      original_task_id: rawDescription.original_task_id || null,
      onetime_targets: Array.isArray(rawDescription.onetime_targets) ? rawDescription.onetime_targets : [],
      completions: rawDescription.completions || {},
      versions: rawDescription.versions || []
    };
  }

  if (typeof rawDescription === 'string') {
    const trimmed = rawDescription.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return {
          description: parsed.description || '',
          project_name: parsed.project_name || '',
          team_name: parsed.team_name || '',
          tag_name: parsed.tag_name || '',
          deadline_time: parsed.deadline_time || '17:00',
          deadline_days: parsed.deadline_days || 'Mon - Fri',
          sub_tasks: Array.isArray(parsed.sub_tasks) ? parsed.sub_tasks : [],
          note: parsed.note || '',
          last_updated_by: parsed.last_updated_by || '',
          last_updated_at: parsed.last_updated_at || '',
          original_task_id: parsed.original_task_id || null,
          onetime_targets: Array.isArray(parsed.onetime_targets) ? parsed.onetime_targets : [],
          completions: parsed.completions || {},
          versions: parsed.versions || []
        };
      } catch {
        // Fallback
      }
    }
  }

  return {
    ...defaultMeta,
    description: String(rawDescription)
  };
};

const ApproveTask: React.FC = () => {
  const { 
    showConfirm,
    projectsList,
    teamsList,
    tagsList,
    assigneesList,
    usersFullList,
    fetchMetadata,
    approveTasks,
    fetchApproveTasks,
    fetchTasks
  } = useAppStore();

  const { profile } = useAuthStore();
  const userRole = (profile?.role || 'user').toString().toLowerCase().trim();
  const isUser = userRole === 'user';
  const isMaster = userRole === 'master';

  // Request list & sync states
  const requests = approveTasks;
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Search & Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssignee, setFilterAssignee] = useState(() => {
    return isUser ? (profile?.name || '') : '';
  });
  const [filterTeam, setFilterTeam] = useState(() => {
    const isMasterOrAdmin = userRole === 'master' || userRole === 'admin';
    if (isMasterOrAdmin && profile?.team_ids && profile.team_ids.length > 0) {
      return profile.team_ids.join(',');
    }
    return profile?.team_ids?.[0] || '';
  });
  const selectedTeams = useMemo(() => {
    return filterTeam ? filterTeam.split(',').filter(Boolean) : [];
  }, [filterTeam]);
  const [filterStatus, setFilterStatus] = useState('PENDING'); // Mặc định chỉ hiển thị Yêu cầu Chờ duyệt (PENDING)
  const [filterProject, setFilterProject] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterTaskType, setFilterTaskType] = useState('');

  // Modals & Panels
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTask, setModalTask] = useState<DbApproveTask | null>(null);
  const [taskToClone, setTaskToClone] = useState<DbApproveTask | null>(null);
  const [openedDrawerTask, setOpenedDrawerTask] = useState<DbApproveTask | null>(null);
  const [activeMenuTaskId, setActiveMenuTaskId] = useState<string | null>(null);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectDialogTask, setRejectDialogTask] = useState<DbApproveTask | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [originalTasksMap, setOriginalTasksMap] = useState<Record<string, number | null>>({});

  // Page index
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const loadRequests = async () => {
    setLoading(true);
    try {
      await fetchApproveTasks(true);
      setTableMissing(false);

      // Load original tasks to get their display ID mapping
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('id, display_id');
      if (!tasksError && tasksData) {
        const map: Record<string, number | null> = {};
        tasksData.forEach((t: any) => {
          map[t.id] = t.display_id || null;
        });
        setOriginalTasksMap(map);
      }
    } catch (err: any) {
      if (err.code === '42P01') {
        setTableMissing(true);
      } else {
        console.error('Error fetching approve tasks:', err);
        toast.error('Failed to load approve tasks creation requests.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getOriginalTaskDisplayId = (originalTaskId: string) => {
    if (!originalTaskId) return '';
    const displayId = originalTasksMap[originalTaskId];
    if (displayId !== undefined && displayId !== null) {
      return String(displayId).padStart(6, '0');
    }
    return getDisplayId(originalTaskId);
  };

  useEffect(() => {
    loadRequests();
    fetchMetadata();
  }, []);

  const parsedRequests = useMemo(() => {
    return requests.map(req => {
      const meta = parseTaskDescription(req.description);
      const matchedUser = usersFullList?.find((u: any) => u.id === req.user_id);
      return {
        ...req,
        meta,
        project_name: meta.project_name,
        team_name: meta.team_name,
        tag_name: meta.tag_name,
        deadline_time: meta.deadline_time,
        deadline_days: meta.deadline_days,
        sub_tasks: meta.sub_tasks,
        note: meta.note || '',
        creator_name: matchedUser?.name || 'User Request'
      };
    });
  }, [requests, usersFullList]);

  const isDefaultFilters = useMemo(() => {
    const defaultAssignee = isUser ? (profile?.name || '') : '';
    const isMasterOrAdmin = userRole === 'master' || userRole === 'admin';
    const defaultTeam = (isMasterOrAdmin && profile?.team_ids && profile.team_ids.length > 0)
      ? profile.team_ids.join(',')
      : (profile?.team_ids?.[0] || '');
    return (
      searchQuery === '' &&
      filterAssignee === defaultAssignee &&
      filterTeam === defaultTeam &&
      filterStatus === 'PENDING' &&
      filterProject === '' &&
      filterTag === '' &&
      filterTaskType === ''
    );
  }, [searchQuery, filterAssignee, filterTeam, filterStatus, filterProject, filterTag, filterTaskType, isUser, profile, userRole]);

  // Filters computed requests
  const filteredRequests = useMemo(() => {
    let result = [...parsedRequests];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(r => 
        r.title.toLowerCase().includes(q) ||
        r.project_name.toLowerCase().includes(q) ||
        r.tag_name.toLowerCase().includes(q)
      );
    }

    if (filterAssignee) {
      result = result.filter(r => 
        r.creator_name === filterAssignee ||
        r.sub_tasks.some((s: any) => s.assignee === filterAssignee)
      );
    }

    if (selectedTeams.length > 0) {
      result = result.filter(r => selectedTeams.includes(r.team_name));
    }

    if (filterStatus) {
      result = result.filter(r => r.status === filterStatus);
    }

    if (filterProject) {
      result = result.filter(r => r.project_name === filterProject);
    }

    if (filterTag) {
      result = result.filter(r => r.tag_name === filterTag);
    }

    if (filterTaskType) {
      result = result.filter(r => r.task_type === filterTaskType);
    }

    return result;
  }, [parsedRequests, searchQuery, filterAssignee, selectedTeams, filterStatus, filterProject, filterTag, filterTaskType]);

  // Pagination bounds
  const totalCount = filteredRequests.length;
  const totalSubtasksCount = useMemo(() => {
    return filteredRequests.reduce((sum, req) => {
      const meta = parseTaskDescription(req.description);
      return sum + (meta?.sub_tasks?.length || 0);
    }, 0);
  }, [filteredRequests]);
  const totalPages = Math.ceil(totalCount / pageSize);
  const paginatedRequests = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRequests.slice(start, start + pageSize);
  }, [filteredRequests, page]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, filterAssignee, filterTeam, filterStatus, filterProject, filterTag, filterTaskType]);

  const handleOpenCreateModal = () => {
    setModalTask(null);
    setTaskToClone(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (task: any) => {
    setModalTask(task);
    setTaskToClone(null);
    setIsModalOpen(true);
    setActiveMenuTaskId(null);
  };

  const handleOpenCloneModal = (task: any) => {
    setModalTask(null);
    setTaskToClone(task);
    setIsModalOpen(true);
    setActiveMenuTaskId(null);
  };

  const handleAcceptRequest = async (request: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveMenuTaskId(null);

    const isEditRequest = !!request.meta?.original_task_id;

    showConfirm({
      title: isEditRequest ? 'Accept Edit - Approve Template Changes' : 'Accept Create - Approve & Create Task Template',
      message: isEditRequest
        ? `Are you sure you want to approve request "${request.title}"? This will apply these changes to the existing Task Manager template and delete this pending request.`
        : `Are you sure you want to approve request "${request.title}"? This will copy this profile into the Active Task Manager list and delete this pending request.`,
      confirmText: isEditRequest ? 'Accept Edit' : 'Accept Create',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setAcceptingId(request.id);
        try {
          let mergedCompletions = request.meta.completions || {};
          let mergedOnetimeTargets = request.meta.onetime_targets || [];
          let updatedVersions = request.meta.versions || [];

          // 1. Fetch Master Data safely to map names back to UUIDs
          const [projRes, teamRes, tagRes] = await Promise.all([
            supabase.from('projects').select('id, name'),
            supabase.from('teams').select('id, name'),
            supabase.from('tags').select('id, name')
          ]);
          const projectsDb = projRes.data || [];
          const teamsDb = teamRes.data || [];
          const tagsDb = tagRes.data || [];

          const selectedProjectObj = projectsDb.find(p => p.name === request.meta.project_name);
          const selectedTeamObj = teamsDb.find(t => t.name === request.meta.team_name);
          const selectedTagObj = tagsDb.find(t => t.name === request.meta.tag_name);

          // 2. Parse deadline days arrays
          let deadlineDaysArray: string[] = [];
          if (typeof request.meta.deadline_days === 'string') {
            if (request.task_type === 'DAILY') {
              deadlineDaysArray = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
            } else if (request.task_type === 'WEEKLY') {
              deadlineDaysArray = request.meta.deadline_days.split(',').map((d: string) => d.trim()).filter(Boolean);
            } else if (request.task_type === 'MONTHLY') {
              deadlineDaysArray = request.meta.deadline_days.split(/[\s,]+/).map((d: string) => d.trim()).filter(Boolean);
            } else {
              deadlineDaysArray = request.meta.deadline_days.split(',').map((d: string) => d.trim()).filter(Boolean);
            }
          } else if (Array.isArray(request.meta.deadline_days)) {
            deadlineDaysArray = request.meta.deadline_days;
          }

          // 3. Parse and normalize deadline time (24-hour style hh:mm:ss)
          const deadlineTimeRaw = request.meta.deadline_time || '';
          let finalDeadlineTime = null;
          if (deadlineTimeRaw) {
            if (deadlineTimeRaw.toUpperCase().includes('AM') || deadlineTimeRaw.toUpperCase().includes('PM')) {
              const parts = deadlineTimeRaw.match(/(\d+):(\d+)\s*(AM|PM)/i);
              if (parts) {
                let hour = parseInt(parts[1], 10);
                const minute = parts[2];
                const ampm = parts[3].toUpperCase();
                if (ampm === 'PM' && hour < 12) hour += 12;
                if (ampm === 'AM' && hour === 12) hour = 0;
                finalDeadlineTime = `${String(hour).padStart(2, '0')}:${minute}:00`;
              } else {
                finalDeadlineTime = deadlineTimeRaw;
              }
            } else {
              finalDeadlineTime = deadlineTimeRaw.includes(':') && deadlineTimeRaw.split(':').length === 2 ? `${deadlineTimeRaw}:00` : deadlineTimeRaw;
            }
          }

          if (isEditRequest) {
            // 1. Fetch the LATEST state of the original task to prevent race conditions & overwriting newer completions
            const { data: originalTask, error: fetchError } = await supabase
              .from('tasks')
              .select('*')
              .eq('id', request.meta.original_task_id)
              .single();

            if (!fetchError && originalTask) {
              const latestMeta = parseTaskDescription(originalTask.description);
              
              // Use the latest completions, versions and onetime_targets from the live database
              mergedCompletions = latestMeta.completions || {};
              mergedOnetimeTargets = latestMeta.onetime_targets || [];
              updatedVersions = latestMeta.versions || [];

              // Reconcile subtask status for completions & target tasks with the newly approved sub-tasks
              const reconcileSubtasksState = (existingSubs: any[] | undefined, templateSubs: any[]): any[] => {
                if (!Array.isArray(existingSubs)) {
                  return templateSubs.map(sf => ({
                    ...sf,
                    sub_status: 'New',
                    actual_minutes: sf.estimated_minutes
                  }));
                }

                const existingMap = new Map(existingSubs.map(s => [s.id, s]));

                return templateSubs.map(templateSub => {
                  const existingSub = existingMap.get(templateSub.id);
                  if (existingSub) {
                    return {
                      ...existingSub,
                      content: templateSub.content,
                      assignee: templateSub.assignee,
                      estimated_minutes: templateSub.estimated_minutes,
                      sub_status: existingSub.sub_status || 'New',
                      actual_minutes: existingSub.actual_minutes !== undefined ? existingSub.actual_minutes : templateSub.estimated_minutes
                    };
                  } else {
                    return {
                      ...templateSub,
                      sub_status: 'New',
                      actual_minutes: templateSub.estimated_minutes
                    };
                  }
                });
              };

              // Reconcile subtasks in live completions (protect already submitted completions from reset)
              Object.keys(mergedCompletions).forEach(key => {
                const comp = mergedCompletions[key];
                if (comp && comp.todo_status !== 'DONE' && comp.todo_status !== 'SKIPPED' && Array.isArray(comp.sub_tasks)) {
                  comp.sub_tasks = reconcileSubtasksState(comp.sub_tasks, request.meta.sub_tasks || []);
                }
              });

              // Reconcile subtasks in live onetime targets
              if (Array.isArray(mergedOnetimeTargets)) {
                mergedOnetimeTargets = (request.meta.onetime_targets || []).map((userTgt: any) => {
                  const existingTgt = latestMeta.onetime_targets?.find((t: any) => t.date === userTgt.date);
                  const isSubmitted = existingTgt?.todo_status === 'DONE' || existingTgt?.todo_status === 'SKIPPED';
                  return {
                    id: userTgt.id,
                    date: userTgt.date,
                    time: userTgt.time,
                    todo_status: existingTgt?.todo_status || 'NEW',
                    sub_tasks: isSubmitted
                      ? (existingTgt?.sub_tasks || [])
                      : reconcileSubtasksState(existingTgt?.sub_tasks, request.meta.sub_tasks || []),
                    actual_time: existingTgt?.actual_time || 0,
                    updated_by: existingTgt?.updated_by,
                    updated_at: existingTgt?.updated_at
                  };
                });
              }

              // 2. Add structural versioning of the old template (just like CreateTaskModal.tsx)
              const todayStr = new Date().toISOString().split('T')[0];
              const getYesterdayDateString = (tStr: string): string => {
                const d = new Date(tStr);
                d.setDate(d.getDate() - 1);
                return d.toISOString().split('T')[0];
              };
              const yesterdayStr = getYesterdayDateString(todayStr);

              const current_valid_from = latestMeta.last_updated_at
                ? latestMeta.last_updated_at.split('T')[0]
                : (originalTask.created_at ? originalTask.created_at.split('T')[0] : todayStr);

              if (current_valid_from <= yesterdayStr) {
                const oldVersion = {
                  valid_from: current_valid_from,
                  valid_until: yesterdayStr,
                  title: originalTask.title,
                  description: latestMeta.description || '',
                  project_name: latestMeta.project_name,
                  team_name: latestMeta.team_name,
                  tag_name: latestMeta.tag_name,
                  deadline_time: latestMeta.deadline_time,
                  deadline_days: latestMeta.deadline_days,
                  est_time: originalTask.est_time,
                  sub_tasks: latestMeta.sub_tasks || []
                };
                updatedVersions = [...updatedVersions, oldVersion];
              }
            }
          }

          const calculated_request_est_time = (request.meta.sub_tasks || []).reduce(
            (sum: number, s: any) => sum + (Number(s.estimated_minutes) || 0), 
            0
          );
          const final_est_time = request.est_time || calculated_request_est_time;

          if (isEditRequest) {
            // Update the existing task template
            const { error: updateError } = await supabase
              .from('tasks')
              .update({
                title: request.title,
                task_name: request.title,
                description: request.meta.note || '', // Cột description chỉ lưu text ghi chú thuần túy
                task_type: request.task_type,
                type: request.task_type,
                est_time: final_est_time,
                project_id: selectedProjectObj?.id || null,
                team_id: selectedTeamObj?.id || null,
                team_ids: selectedTeamObj?.id ? [selectedTeamObj.id] : [],
                tag_id: selectedTagObj?.id || null,
                deadline_time: finalDeadlineTime,
                deadline_days: deadlineDaysArray
              })
              .eq('id', request.meta.original_task_id);

            if (updateError) throw updateError;

            // --- THUẬT TOÁN ĐỒNG BỘ DELTA CHO SUBTASKS (SUBTASK DELTA SYNC) ---
            // Tránh xóa trắng subtask cũ của task template, tiến hành so sánh theo ID
            const { data: dbSubtasks, error: fetchSubError } = await supabase
              .from('subtasks')
              .select('id, subtask_id')
              .eq('task_id', request.meta.original_task_id);

            if (fetchSubError) throw fetchSubError;

            const dbSubsArray = dbSubtasks || [];
            const draftSubtasks = request.meta.sub_tasks || [];

            const subtasksToUpdate: any[] = [];
            const subtasksToInsert: any[] = [];
            const subtasksToDelete: any[] = [];

            // Tạo map tìm kiếm nhanh subtask trong Database theo cả id và subtask_id
            const dbSubtaskMap = new Map();
            dbSubsArray.forEach((dbSub: any) => {
              dbSubtaskMap.set(dbSub.subtask_id, dbSub);
              dbSubtaskMap.set(dbSub.id, dbSub);
            });

            const seenDbIds = new Set<string>();

            // Phân loại UPDATE và INSERT
            draftSubtasks.forEach((st: any) => {
              const matchedDbSub = dbSubtaskMap.get(st.id);

              if (matchedDbSub) {
                // Nhóm UPDATE: Có ID trùng khớp, tiến hành cập nhật content, assignee, estimated_minutes
                subtasksToUpdate.push({
                  id: matchedDbSub.id,
                  content: st.content,
                  assignee: st.assignee,
                  estimated_minutes: Number(st.estimated_minutes) || 0
                });
                seenDbIds.add(matchedDbSub.id);
              } else {
                // Nhóm INSERT: Không thấy ID khớp, chèn mới subtask bản ghi kèm theo task_id 
                subtasksToInsert.push({
                  task_id: request.meta.original_task_id,
                  subtask_id: st.id || Math.random().toString(36).substring(2, 9),
                  content: st.content,
                  assignee: st.assignee,
                  estimated_minutes: Number(st.estimated_minutes) || 0,
                  actual_minutes: 0,
                  status: 'PENDING'
                });
              }
            });

            // Phân loại DELETE: Những subtask cũ trong Database nay không còn xuất hiện trong nháp phê duyệt
            dbSubsArray.forEach((dbSub: any) => {
              if (!seenDbIds.has(dbSub.id)) {
                if (!subtasksToDelete.find(d => d.id === dbSub.id)) {
                  subtasksToDelete.push(dbSub);
                }
              }
            });

            // Thực thi chênh lệch Delta trên Supabase
            if (subtasksToDelete.length > 0) {
              const deleteIds = subtasksToDelete.map(d => d.id);
              const { error: delErr } = await supabase
                .from('subtasks')
                .delete()
                .in('id', deleteIds);
              if (delErr) throw delErr;
            }

            if (subtasksToUpdate.length > 0) {
              const updatePromises = subtasksToUpdate.map(sub => {
                const { id, ...updateData } = sub;
                return supabase
                  .from('subtasks')
                  .update(updateData)
                  .eq('id', id);
              });
              const updateResults = await Promise.all(updatePromises);
              const firstErr = updateResults.find(r => r.error);
              if (firstErr) throw firstErr.error;
            }

            if (subtasksToInsert.length > 0) {
              const { error: insErr } = await supabase
                .from('subtasks')
                .insert(subtasksToInsert);
              if (insErr) throw insErr;
            }

            await logger.log(
              'APPROVE_TASK_ACCEPTED', 
              `Accepted and updated task template "${request.title}" suggested by user`, 
              { title: request.title, originalTaskId: request.meta.original_task_id, originalRequestId: request.id }
            );

            toast.success(`Request accepted! Changes applied to task template "${request.title}".`);
          } else {
            // Insert into standard tasks list
            const { data: newTasks, error: insertError } = await supabase
              .from('tasks')
              .insert([{
                title: request.title,
                task_name: request.title,
                description: request.meta.note || '', // Cột description chỉ lưu text ghi chú thuần túy
                task_type: request.task_type,
                type: request.task_type,
                status: 'ON',
                is_active: true,
                est_time: final_est_time,
                actual_time: 0,
                project_id: selectedProjectObj?.id || null,
                team_id: selectedTeamObj?.id || null,
                team_ids: selectedTeamObj?.id ? [selectedTeamObj.id] : [],
                tag_id: selectedTagObj?.id || null,
                deadline_time: finalDeadlineTime,
                deadline_days: deadlineDaysArray
              }])
              .select();

            if (insertError) throw insertError;
            if (!newTasks || newTasks.length === 0) {
              throw new Error("Could not retrieve newly created task ID.");
            }

            const newTaskId = newTasks[0].id;

            // Chèn toàn bộ các subtasks đi kèm vào bảng subtasks
            const subtasksToInsert = (request.meta.sub_tasks || []).map((st: any) => ({
              task_id: newTaskId,
              subtask_id: st.id || Math.random().toString(36).substring(2, 9),
              content: st.content,
              assignee: st.assignee,
              estimated_minutes: Number(st.estimated_minutes) || 0,
              actual_minutes: 0,
              status: 'PENDING'
            }));

            if (subtasksToInsert.length > 0) {
              const { error: insertSubError } = await supabase
                .from('subtasks')
                .insert(subtasksToInsert);
              if (insertSubError) throw insertSubError;
            }

            await logger.log(
              'APPROVE_TASK_ACCEPTED', 
              `Accepted and created task profile "${request.title}" suggested by user`, 
              { title: request.title, originalRequestId: request.id }
            );

            toast.success(`Request accepted! Task template "${request.title}" is now live in Task Manager.`);
          }

          // Cập nhật trạng thái bản ghi trong bảng approve_tasks thành 'APPROVED' thay vì xóa hẳn
          const { error: updateRequestError } = await supabase
            .from('approve_tasks')
            .update({ status: 'APPROVED' })
            .eq('id', request.id);

          if (updateRequestError) throw updateRequestError;

          setOpenedDrawerTask(null);
          // Reload global tasks and approve requests list synchronously
          await fetchTasks(true);
          await loadRequests();
        } catch (err: any) {
          console.error('[ApproveTask] Error accepting request:', err);
          toast.error(`Database Error: ${err.message || 'Could not approve request template'}`);
        } finally {
          setAcceptingId(null);
        }
      }
    });
  };

  const handleRejectRequest = (request: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveMenuTaskId(null);
    setRejectDialogTask(request);
    setRejectReasonInput('');
    setIsRejectDialogOpen(true);
  };

  const submitRejectRequest = async () => {
    if (!rejectDialogTask) return;
    const reason = rejectReasonInput.trim();
    if (!reason) {
      toast.error('Please enter a reason for rejection.');
      return;
    }

    setRejectingId(rejectDialogTask.id);
    try {
      const { error } = await supabase
        .from('approve_tasks')
        .update({ status: 'REJECTED', reject_reason: reason })
        .eq('id', rejectDialogTask.id);

      if (error) throw error;

      await logger.log(
        'APPROVE_TASK_REJECTED', 
        `Rejected task request of "${rejectDialogTask.title}" with reason: ${reason}`, 
        { approveTaskId: rejectDialogTask.id, title: rejectDialogTask.title, reject_reason: reason }
      );

      toast.error(`Task request "${rejectDialogTask.title}" was marked as Rejected.`);
      if (openedDrawerTask?.id === rejectDialogTask.id) {
        setOpenedDrawerTask(null);
      }
      setIsRejectDialogOpen(false);
      setRejectDialogTask(null);
      setRejectReasonInput('');
      loadRequests();
    } catch (err: any) {
      console.error('[ApproveTask] Error rejecting:', err);
      toast.error(`Database Error: ${err.message || 'Could not reject request'}`);
    } finally {
      setRejectingId(null);
    }
  };

  const handleDeleteRequest = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActiveMenuTaskId(null);

    showConfirm({
      title: 'Delete Request',
      message: 'Are you sure you want to permanently delete this task creation request? This action can\'t be undone.',
      confirmText: 'Delete Permanently',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setDeletingId(id);
        try {
          const { error } = await supabase
            .from('approve_tasks')
            .delete()
            .eq('id', id);

          if (error) throw error;

          toast.success('Task request deleted successfully.');
          setOpenedDrawerTask(null);
          loadRequests();
        } catch (err: any) {
          console.error('[ApproveTask] Error deleting:', err);
          toast.error(`Database Error: ${err.message || 'Could not delete request record'}`);
        } finally {
          setDeletingId(null);
        }
      }
    });
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterAssignee(isUser ? (profile?.name || '') : '');
    const isMasterOrAdmin = userRole === 'master' || userRole === 'admin';
    const defaultTeamVal = (isMasterOrAdmin && profile?.team_ids && profile.team_ids.length > 0)
      ? profile.team_ids.join(',')
      : (profile?.team_ids?.[0] || '');
    setFilterTeam(defaultTeamVal);
    setFilterStatus('PENDING');
    setFilterProject('');
    setFilterTag('');
    setFilterTaskType('');
    setPage(1);
  };

  const getPaginationItems = () => {
    const items: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) items.push(i);
    } else {
      if (page <= 3) {
        items.push(1, 2, 3, 4, '...', totalPages);
      } else if (page >= totalPages - 2) {
        items.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        items.push(1, '...', page - 1, page, page + 1, '...', totalPages);
      }
    }
    return items;
  };

  const drawerParsedMeta = openedDrawerTask ? parseTaskDescription(openedDrawerTask.description) : null;
  const isDrawerOpeningRejected = openedDrawerTask?.status === 'REJECTED';

  const [originalTask, setOriginalTask] = useState<any | null>(null);

  useEffect(() => {
    if (openedDrawerTask) {
      const meta = parseTaskDescription(openedDrawerTask.description);
      if (meta.original_task_id) {
        supabase
          .from('tasks')
          .select('*')
          .eq('id', meta.original_task_id)
          .single()
          .then(({ data, error }) => {
            if (!error && data) {
              const origMeta = parseTaskDescription(data.description);
              setOriginalTask({
                ...data,
                meta: origMeta
              });
            } else {
              setOriginalTask(null);
            }
          });
      } else {
        setOriginalTask(null);
      }
    } else {
      setOriginalTask(null);
    }
  }, [openedDrawerTask]);

  const isEdit = !!originalTask;
  const oldTitle = isEdit ? originalTask.title : '';
  const isTitleChanged = isEdit && openedDrawerTask?.title !== oldTitle;

  const oldProject = isEdit ? originalTask.meta?.project_name : '';
  const isProjectChanged = isEdit && drawerParsedMeta?.project_name !== oldProject;

  const oldTag = isEdit ? originalTask.meta?.tag_name : '';
  const isTagChanged = isEdit && drawerParsedMeta?.tag_name !== oldTag;

  const oldTeam = isEdit ? originalTask.meta?.team_name : '';
  const isTeamChanged = isEdit && drawerParsedMeta?.team_name !== oldTeam;

  const oldTaskType = isEdit ? originalTask.task_type : '';
  const isTaskTypeChanged = isEdit && openedDrawerTask?.task_type !== oldTaskType;

  const oldDeadlineDays = isEdit ? originalTask.deadline_days : '';
  const isDeadlineDaysChanged = isEdit && openedDrawerTask?.deadline_days !== oldDeadlineDays;

  const oldDeadlineTime = isEdit ? originalTask.meta?.deadline_time : '';
  const isDeadlineTimeChanged = isEdit && drawerParsedMeta?.deadline_time !== oldDeadlineTime;

  const oldNote = isEdit ? originalTask.meta?.note : '';
  const isNoteChanged = isEdit && drawerParsedMeta?.note !== oldNote;

  const reconciledSubTasks = useMemo(() => {
    if (!drawerParsedMeta) return [];
    if (!isEdit || !originalTask) {
      return (drawerParsedMeta.sub_tasks || []).map((s: any) => ({
        ...s,
        status: 'added' as const,
      }));
    }

    const oldSubs = originalTask.meta?.sub_tasks || [];
    const newSubs = drawerParsedMeta.sub_tasks || [];

    const result: {
      id: string;
      content: string;
      assignee: string;
      estimated_minutes: number;
      status: 'unchanged' | 'modified' | 'deleted' | 'added';
      oldContent?: string;
      oldAssignee?: string;
      oldEstimatedMinutes?: number;
      hasContentChanged?: boolean;
      hasAssigneeChanged?: boolean;
      hasMinutesChanged?: boolean;
    }[] = [];

    const newMap = new Map(newSubs.map((s: any) => [s.id, s]));

    oldSubs.forEach((oldSub: any) => {
      const newSub = newMap.get(oldSub.id);
      if (!newSub) {
        result.push({
          id: oldSub.id,
          content: oldSub.content,
          assignee: oldSub.assignee,
          estimated_minutes: oldSub.estimated_minutes,
          status: 'deleted',
        });
      } else {
        const hasContentChanged = newSub.content !== oldSub.content;
        const hasAssigneeChanged = newSub.assignee !== oldSub.assignee;
        const hasMinutesChanged = Number(newSub.estimated_minutes) !== Number(oldSub.estimated_minutes);

        result.push({
          id: newSub.id,
          content: newSub.content,
          assignee: newSub.assignee,
          estimated_minutes: newSub.estimated_minutes,
          status: (hasContentChanged || hasAssigneeChanged || hasMinutesChanged) ? 'modified' : 'unchanged',
          oldContent: oldSub.content,
          oldAssignee: oldSub.assignee,
          oldEstimatedMinutes: oldSub.estimated_minutes,
          hasContentChanged,
          hasAssigneeChanged,
          hasMinutesChanged,
        });
      }
    });

    const oldIds = new Set(oldSubs.map((s: any) => s.id));
    newSubs.forEach((newSub: any) => {
      if (!oldIds.has(newSub.id)) {
        result.push({
          id: newSub.id,
          content: newSub.content,
          assignee: newSub.assignee,
          estimated_minutes: newSub.estimated_minutes,
          status: 'added',
        });
      }
    });

    return result;
  }, [isEdit, originalTask, drawerParsedMeta]);

  const reconciledOnetimeTargets = useMemo(() => {
    if (!drawerParsedMeta) return [];
    const oldTargets = (isEdit && originalTask?.meta?.onetime_targets) ? originalTask.meta.onetime_targets : [];
    const newTargets = drawerParsedMeta.onetime_targets ? drawerParsedMeta.onetime_targets : [];

    if (!isEdit || !originalTask) {
      return newTargets.map((t: any) => ({
        ...t,
        status: 'added' as const
      }));
    }

    const result: {
      id: string;
      date: string;
      time: string;
      status: 'unchanged' | 'modified' | 'deleted' | 'added';
      oldDate?: string;
      oldTime?: string;
      hasDateChanged?: boolean;
      hasTimeChanged?: boolean;
    }[] = [];

    const newMap = new Map(newTargets.map((tgt: any) => [tgt.id, tgt]));

    oldTargets.forEach((oldTgt: any) => {
      const newTgt = newMap.get(oldTgt.id);
      if (!newTgt) {
        result.push({
          id: oldTgt.id,
          date: oldTgt.date,
          time: oldTgt.time,
          status: 'deleted'
        });
      } else {
        const hasDateChanged = newTgt.date !== oldTgt.date;
        const hasTimeChanged = newTgt.time !== oldTgt.time;

        result.push({
          id: oldTgt.id,
          date: newTgt.date,
          time: newTgt.time,
          status: (hasDateChanged || hasTimeChanged) ? 'modified' : 'unchanged',
          oldDate: oldTgt.date,
          oldTime: oldTgt.time,
          hasDateChanged,
          hasTimeChanged
        });
      }
    });

    const oldIds = new Set(oldTargets.map((t: any) => t.id));
    newTargets.forEach((newTgt: any) => {
      if (!oldIds.has(newTgt.id)) {
        result.push({
          id: newTgt.id,
          date: newTgt.date,
          time: newTgt.time,
          status: 'added'
        });
      }
    });

    return result;
  }, [isEdit, originalTask, drawerParsedMeta]);

  // Render a clean SQL initializer card if database table missing
  if (tableMissing) {
    return (
      <div className="h-full w-full bg-slate-50 flex items-center justify-center p-6 text-left selection:bg-indigo-100">
        <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500 rounded-full blur-[120px]"></div>
        </div>
        
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xl max-w-xl w-full p-6 space-y-4 animate-in zoom-in-95 duration-200 relative z-10">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full shrink-0">
              <AlertCircle size={26} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800 leading-snug">Supabase Schema Update Required</h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                The database table <span className="font-mono bg-slate-50 px-1 border border-slate-150 rounded text-slate-700 font-bold">approve_tasks</span> table is missing. To support the "Approve Task" registration flow, please run the following SQL statements in your Supabase SQL Editor.
              </p>
            </div>
          </div>

          <div className="bg-slate-900 rounded-xl p-4 text-[11px] font-mono text-slate-300 overflow-x-auto dark:border dark:border-slate-800/60 max-h-[220px]">
{`-- 1. Create Approve Tasks Table
CREATE TABLE public.approve_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description JSONB NOT NULL,
    task_type TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'REJECTED')),
    est_time INTEGER DEFAULT 0,
    actual_time INTEGER DEFAULT 0,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    reject_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Row Level Security (RLS)
ALTER TABLE public.approve_tasks DISABLE ROW LEVEL SECURITY;

-- 3. Sync Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.approve_tasks;`}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">dymapp admin helpdesk</span>
            <div className="flex gap-2">
              <button 
                onClick={loadRequests}
                className="h-8 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold cursor-pointer transition-colors"
              >
                Refresh connection
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white overflow-x-auto relative font-sans">
      
      {/* 1. Header Toolbar Filters */}
      <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex items-center justify-between gap-4 flex-nowrap overflow-visible relative z-[40] min-w-[1350px] w-full mb-0">
        <div className="flex items-center gap-2 shrink-0 flex-nowrap">
          
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input 
              type="text" 
              className="pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-md text-xs w-52 focus:outline-none focus:border-slate-400 font-medium text-slate-700 h-8 shadow-sm"
              placeholder="Search request..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Personnel search dropdown filter */}
          <SearchableFilterSelect
            options={assigneesList.map(name => ({ value: name, label: name }))}
            value={filterAssignee}
            onChange={setFilterAssignee}
            defaultOptionLabel="All Assignees"
            className="w-[190px] min-w-[190px] max-w-[190px]"
          />

          {/* Project Dropdown Filter */}
          <FilterSelect
            options={projectsList.map(name => ({ value: name, label: name }))}
            value={filterProject}
            onChange={(val) => {
              setFilterProject(val);
              setPage(1);
            }}
            defaultOptionLabel="Projects"
            className="w-[190px] min-w-[190px] max-w-[190px]"
          />

          {/* Tag Dropdown Filter */}
          <FilterSelect
            options={tagsList.map(name => ({ value: name, label: name }))}
            value={filterTag}
            onChange={(val) => setFilterTag(val)}
            defaultOptionLabel="Tags"
            className="w-[120px] min-w-[120px] max-w-[120px]"
          />

          {/* Team Dropdown Filter */}
          <MultiTeamFilterSelect
            options={teamsList.map(name => ({ value: name, label: name }))}
            value={filterTeam}
            onChange={(val) => {
              setFilterTeam(val);
              setPage(1);
            }}
            defaultOptionLabel="Teams"
            className="w-[120px] min-w-[120px] max-w-[120px]"
          />

          {/* Filter Task Type */}
          <FilterSelect 
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

          {/* Status Dropdown selector */}
          <FilterSelect
            options={[
              { value: 'PENDING', label: 'Pending' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'REJECTED', label: 'Rejected' },
            ]}
            value={filterStatus}
            onChange={(val) => setFilterStatus(val)}
            defaultOptionLabel="Status"
            className="w-[100px] min-w-[100px] max-w-[100px]"
          />

          {/* Reset Action */}
          {!isDefaultFilters && (
            <button
              onClick={handleResetFilters}
              className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Reset filters"
            >
              <RotateCcw size={14} />
            </button>
          )}

        </div>

        {/* Approve Create trigger */}
        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 px-3 h-8 bg-indigo-600 hover:bg-indigo-700 transition-colors text-white rounded-md text-xs font-semibold shadow-sm cursor-pointer select-none"
          >
            <Plus size={14} />
            <span>Approve Create</span>
          </button>
        </div>
      </div>

      {/* 2. Main High-Polished Grid */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white min-h-[400px] min-w-[1350px] w-full">
        {loading ? (
          <div className="h-full w-full flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-slate-400 font-medium">Loading requests...</p>
          </div>
        ) : paginatedRequests.length > 0 ? (
          <table className="w-full text-left border-collapse table-fixed select-none min-w-[1350px]">
            <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-20">
              <tr className="h-8">
                <th className="w-[5%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">ID</th>
                <th className="w-[12%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Task Name</th>
                <th className="w-[13%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Project</th>
                <th className="w-[7%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Tag</th>
                <th className="w-[6%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Team</th>
                <th className="w-[6%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center bg-slate-100">Type</th>
                <th className="w-[12%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Type Detail</th>
                <th className="w-[12%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Deadline</th>
                <th className="w-[8%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Approve Type</th>
                <th className="w-[8%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center bg-slate-100">Est. min</th>
                <th className="w-[5%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center bg-slate-100">Status</th>
                <th className="w-[6%] px-3 text-[11px] uppercase tracking-wider font-bold text-slate-500 text-center bg-slate-100">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y premium-divide">
              {paginatedRequests.map((task) => (
                <tr 
                  key={task.id} 
                  className="h-[46px] hover:bg-slate-50/50 transition-colors group cursor-pointer"
                  onClick={() => setOpenedDrawerTask(task)}
                >
                  {/* ID */}
                  <td className="px-3 py-1.5 overflow-hidden">
                    {task.meta?.original_task_id ? (
                      <span className="font-mono text-xs font-semibold text-slate-500">
                        {getOriginalTaskDisplayId(task.meta.original_task_id)}
                      </span>
                    ) : null}
                  </td>

                  {/* Task Name */}
                  <td className="px-3 py-1.5 overflow-hidden">
                    <span className="font-semibold text-slate-700 text-xs truncate block" title={task.title || ''}>
                      {task.title}
                    </span>
                  </td>

                  {/* Project */}
                  <td className="px-3 py-1.5 overflow-hidden">
                    <span className="text-slate-600 text-xs truncate block font-normal" title={task.project_name || ''}>
                      {task.project_name}
                    </span>
                  </td>

                  {/* Tag */}
                  <td className="px-3 py-1.5 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <span className="inline-block bg-slate-50 border border-slate-100 px-2 py-0.5 rounded text-xs text-slate-600 truncate max-w-full font-medium">
                      {task.tag_name}
                    </span>
                  </td>

                  {/* Team */}
                  <td className="px-3 py-1.5 overflow-hidden">
                    <span className="text-slate-500 text-xs truncate block font-normal" title={task.team_name || ''}>
                      {task.team_name}
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

                  {/* Approve Type */}
                  <td className="px-3 py-1.5 overflow-hidden">
                    {task.meta?.original_task_id ? (
                      <span className="inline-block px-2 py-0.5 border border-purple-200 bg-purple-50 text-purple-700 text-[10px] font-bold tracking-wide rounded uppercase select-none">
                        Edit
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-bold tracking-wide rounded uppercase select-none">
                        Create
                      </span>
                    )}
                  </td>

                  {/* Estimated minutes */}
                  <td className="px-3 py-1.5 text-center" onClick={(e) => { e.stopPropagation(); setOpenedDrawerTask(task); }}>
                    <span className="text-indigo-600 hover:text-indigo-800 font-medium font-mono text-xs cursor-pointer">
                      {task.est_time || 0}m
                    </span>
                  </td>

                  {/* Status Badge */}
                  <td className="px-3 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <span className={`inline-block border px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
                      task.status === 'PENDING' 
                        ? 'bg-amber-50 border-amber-200 text-amber-600'
                        : task.status === 'APPROVED'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                          : 'bg-red-50 border-red-200 text-red-600'
                    }`}>
                      {task.status || 'PENDING'}
                    </span>
                  </td>

                  {/* Actions Dropdown row menu */}
                  <td className="px-3 py-1.5 text-center relative" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => setActiveMenuTaskId(activeMenuTaskId === task.id ? null : task.id)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      <MoreHorizontal size={14} />
                    </button>

                    {activeMenuTaskId === task.id && (
                      <div className="absolute right-3 top-8 bg-white border border-slate-200 rounded-md shadow-lg py-1 z-[100] w-[150px] text-left">
                        
                        {/* Admin / Master actions (Accept / Reject) */}
                        {!isUser && task.status === 'PENDING' && (
                          <>
                            <button
                              onClick={(e) => handleAcceptRequest(task, e)}
                              disabled={acceptingId === task.id}
                              className="w-full text-left px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center gap-2 cursor-pointer"
                            >
                              <Check size={12} className="text-emerald-500" />
                              <span>
                                {acceptingId === task.id
                                  ? 'Approving...'
                                  : task.meta?.original_task_id
                                    ? 'Accept Edit'
                                    : 'Accept Create'}
                              </span>
                            </button>
                            
                            {task.status !== 'REJECTED' && (
                              <button
                                onClick={(e) => handleRejectRequest(task, e)}
                                disabled={rejectingId === task.id}
                                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-50 transition-colors flex items-center gap-2 cursor-pointer"
                              >
                                <Ban size={12} className="text-amber-500" />
                                <span>Reject Request</span>
                              </button>
                            )}
                          </>
                        )}

                        <button
                          onClick={() => handleOpenEditModal(task)}
                          className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <Edit2 size={12} className="text-slate-400" />
                          <span>Edit / Re-approve</span>
                        </button>

                        <button
                          onClick={(e) => handleDeleteRequest(task.id, e)}
                          disabled={deletingId === task.id}
                          className="w-full text-left px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <Trash2 size={12} className="text-red-500 shrink-0" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-24 flex flex-col items-center justify-center text-center">
            <div className="p-4 bg-slate-50 rounded-full mb-3 text-slate-350">
              <AlertCircle size={36} />
            </div>
            <h4 className="text-slate-800 font-bold text-sm">No Approvals Found</h4>
            <p className="text-slate-400 text-xs mt-1 max-w-xs leading-relaxed">
              Create a request using "+ Approve Create" or refine your filter parameters.
            </p>
          </div>
        )}
      </div>

      {/* 3. Footer Stats */}
      <div className="px-6 py-3 flex items-center justify-between border-t border-slate-100 bg-white shrink-0 selection:bg-none min-w-[1350px] w-full">
        <span className="text-xs font-semibold text-slate-400 font-mono">
          Total: {totalCount} approval records | {totalSubtasksCount} subtasks
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
                        : "text-slate-350 cursor-default"
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

      {/* 4. Details Drawer Display overlay */}
      {openedDrawerTask && drawerParsedMeta && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity cursor-pointer animate-in fade-in duration-200" 
            onClick={() => setOpenedDrawerTask(null)}
          />
          <div className="relative w-full max-w-[450px] bg-white h-full shadow-2xl flex flex-col z-10 border-l border-slate-100 animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-slate-400">Request details profile</span>
              <button 
                onClick={() => setOpenedDrawerTask(null)}
                className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-all"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 
                    className={`text-sm font-semibold leading-tight ${isTitleChanged ? 'text-red-600 font-bold' : 'text-slate-800'}`}
                    title={isTitleChanged ? `Original: ${oldTitle}` : undefined}
                  >
                    {openedDrawerTask.title}
                  </h2>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    openedDrawerTask.status === 'PENDING'
                      ? 'bg-amber-50 border-amber-200 text-amber-600'
                      : openedDrawerTask.status === 'APPROVED'
                        ? 'bg-emerald-50 border-emerald-250 text-emerald-600'
                        : 'bg-red-50 border-red-200 text-red-600'
                  }`}>
                    {openedDrawerTask.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-lg p-3 text-xs border border-slate-100">
                <div 
                  className={`space-y-0.5 p-1 rounded transition-colors ${isProjectChanged ? 'bg-red-50/40 border border-red-100/50' : ''}`}
                  title={isProjectChanged ? `Original: ${oldProject}` : undefined}
                >
                  <span className="text-slate-400 font-medium block">Project</span>
                  <span className={`block text-xs font-semibold truncate ${isProjectChanged ? 'text-red-600' : 'text-slate-700 hover:text-indigo-600 cursor-pointer transition-colors'}`}>{drawerParsedMeta.project_name}</span>
                </div>

                <div 
                  className={`space-y-0.5 p-1 rounded transition-colors ${isTagChanged ? 'bg-red-50/40 border border-red-100/50' : ''}`}
                  title={isTagChanged ? `Original: ${oldTag}` : undefined}
                >
                  <span className="text-slate-400 font-medium block">Tag</span>
                  <span className={`block text-xs truncate ${isTagChanged ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>{drawerParsedMeta.tag_name}</span>
                </div>

                <div 
                  className={`space-y-0.5 p-1 rounded transition-colors ${isTeamChanged ? 'bg-red-50/40 border border-red-100/50' : ''}`}
                  title={isTeamChanged ? `Original: ${oldTeam}` : undefined}
                >
                  <span className="text-slate-400 font-medium block">Team</span>
                  <span className={`block text-xs truncate ${isTeamChanged ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>{drawerParsedMeta.team_name}</span>
                </div>

                <div 
                  className={`space-y-0.5 p-1 rounded transition-colors ${
                    (isTaskTypeChanged || isDeadlineDaysChanged) ? 'bg-red-50/40 border border-red-100/50' : ''
                  }`}
                  title={(isTaskTypeChanged || isDeadlineDaysChanged) ? `Original: ${oldTaskType}${oldDeadlineDays ? ` (${formatDisplayDate(oldDeadlineDays)})` : ''}` : undefined}
                >
                  <span className="text-slate-400 font-medium block">Frequency and repeat</span>
                  <span className={`block text-xs font-semibold ${ (isTaskTypeChanged || isDeadlineDaysChanged) ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>
                    {openedDrawerTask.task_type}
                  </span>
                  {openedDrawerTask.deadline_days && (
                    <span className={`block text-[11px] font-mono mt-0.5 leading-normal break-all ${ (isTaskTypeChanged || isDeadlineDaysChanged) ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                      ({formatDisplayDate(openedDrawerTask.deadline_days)})
                    </span>
                  )}
                </div>

                <div 
                  className={`space-y-0.5 p-1 rounded transition-colors ${
                    isDeadlineTimeChanged ? 'bg-red-50/40 border border-red-100/50' : ''
                  }`}
                  title={isDeadlineTimeChanged ? `Original: ${oldDeadlineTime}` : undefined}
                >
                  <span className="text-slate-400 font-medium block">Deadline time</span>
                  <span className={`block text-xs truncate ${ isDeadlineTimeChanged ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>
                    {drawerParsedMeta.deadline_time || '17:00'}
                  </span>
                </div>
              </div>

              {/* Notes display */}
              <div 
                className={`note-section-wrapper bg-slate-50 border rounded-lg p-3 text-xs ${
                  isNoteChanged ? 'is-note-changed border-red-200 bg-red-50/15' : 'border-slate-100/80'
                }`}
                title={isNoteChanged ? `Original: ${formatDisplayDate(oldNote)}` : undefined}
              >
                <span className={`font-bold block uppercase tracking-wider text-[10px] ${isNoteChanged ? 'text-red-500' : 'text-slate-450'}`}>Reference Link Notes</span>
                <div className="mt-1 font-medium leading-normal">
                  {(() => {
                    const noteStr = drawerParsedMeta.note || '';
                    if (!noteStr) return <span className="text-slate-400 italic">No notes/URLs entered</span>;
                    const trimmed = noteStr.trim();
                    const looksLikeUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://') || /^(www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed);
                    const textClass = isNoteChanged ? 'text-red-600 font-semibold' : 'text-slate-700';
                    if (looksLikeUrl) {
                      const href = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
                      return (
                        <a 
                          href={href} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className={`hover:underline font-bold break-all inline-flex items-center gap-1 ${
                            isNoteChanged ? 'text-red-600' : 'text-indigo-600 hover:text-indigo-800'
                          }`}
                        >
                          {formatDisplayDate(trimmed)}
                        </a>
                      );
                    }
                    return <span className={`${textClass} break-words`}>{formatDisplayDate(trimmed)}</span>;
                  })()}
                </div>
              </div>

              {/* Rejection Reason display */}
              {openedDrawerTask?.reject_reason && (
                <div className="space-y-1 bg-red-50 border border-red-100 rounded-lg p-3 text-xs">
                  <span className="text-red-500 font-bold block uppercase tracking-wider text-[10px]">Rejection Reason</span>
                  <div className="mt-1 font-medium leading-normal text-red-700 whitespace-pre-wrap break-words">
                    {openedDrawerTask.reject_reason}
                  </div>
                </div>
              )}

              {/* Onetime targets display removed as requested */}

              {/* Subtasks */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <h3 className="text-xs font-semibold text-slate-500">Requested Sub-tasks</h3>
                  <span className="text-xs font-semibold text-indigo-600 font-mono">
                    Total est hours: {(openedDrawerTask.est_time / 60).toFixed(1)} hrs ({openedDrawerTask.est_time || 0} min)
                  </span>
                </div>

                <div className="space-y-2">
                  {reconciledSubTasks && reconciledSubTasks.length > 0 ? (
                    reconciledSubTasks.map((sub, idx) => {
                      const isDeleted = sub.status === 'deleted';
                      const isModified = sub.status === 'modified';
                      const isAdded = sub.status === 'added';

                      let contentClass = "text-xs font-medium leading-normal";
                      let assigneeClass = "text-[10px] sm:text-xs rounded px-1.5 py-0.5 ml-auto shrink-0 font-medium border";
                      let minutesClass = "font-medium";
                      let boxClass = "border transition-all rounded-lg p-3 flex flex-col justify-between gap-2 relative shadow-xs animate-in fade-in";

                      if (isDeleted) {
                        boxClass += " border-red-200 bg-red-10/10 text-red-500 line-through";
                        contentClass += " text-red-500 line-through";
                        assigneeClass += " bg-red-50 text-red-500 border-red-100 line-through";
                        minutesClass += " text-red-500 line-through";
                      } else if (isModified) {
                        boxClass += " border-amber-200 bg-white";
                        contentClass += sub.hasContentChanged ? " text-red-600 font-semibold" : " text-slate-700";
                        assigneeClass += sub.hasAssigneeChanged ? " bg-red-50 text-red-600 border-red-200 font-semibold" : " bg-slate-50 text-slate-500 border-slate-100";
                        minutesClass += sub.hasMinutesChanged ? " text-red-600 font-semibold" : " text-slate-700";
                      } else if (isAdded) {
                        boxClass += " border-emerald-100 bg-emerald-50/10";
                        contentClass += " text-emerald-700 font-medium";
                        assigneeClass += " bg-emerald-50 text-emerald-600 border-emerald-150";
                        minutesClass += " text-emerald-600";
                      } else {
                        boxClass += " border-slate-100 hover:border-blue-100 bg-white hover:bg-blue-50/10";
                        contentClass += " text-slate-700";
                        assigneeClass += " bg-slate-50 text-slate-500 border-slate-100";
                        minutesClass += " text-slate-700";
                      }

                      const contentTooltip = sub.hasContentChanged ? `Original content: ${sub.oldContent}` : undefined;
                      const assigneeTooltip = sub.hasAssigneeChanged ? `Original assignee: ${sub.oldAssignee}` : undefined;
                      const minutesTooltip = sub.hasMinutesChanged ? `Original est minutes: ${sub.oldEstimatedMinutes} min` : undefined;
                      const boxTooltip = isDeleted ? "This subtask was deleted in this edit" : isAdded ? "This subtask was added in this edit" : undefined;

                      return (
                        <div 
                          key={sub.id || idx}
                          className={boxClass}
                          title={boxTooltip}
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span 
                              className={contentClass}
                              title={contentTooltip}
                            >
                              {sub.content}
                            </span>
                            <span 
                              className={assigneeClass}
                              title={assigneeTooltip}
                            >
                              {sub.assignee}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-50">
                            <div className="flex-1 bg-slate-50 border border-slate-100 rounded px-2 py-1 text-xs text-slate-400 flex items-center justify-between font-mono">
                              <span>Estimated</span>
                              <span 
                                className={minutesClass}
                                title={minutesTooltip}
                              >
                                {sub.estimated_minutes} min
                              </span>
                            </div>
                            
                            <div className="border border-slate-100 rounded px-2 py-1 text-[10px] sm:text-xs text-slate-400 shrink-0 font-mono text-center">
                              {isDeleted ? 'Deleted' : isAdded ? 'Added' : isModified ? 'Modified' : 'Unchanged'}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-6 border border-dashed border-slate-200 hover:border-blue-200 transition-all rounded-xl text-slate-400 text-xs bg-slate-50/40">
                      No sub-tasks listed.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Accept / Reject actions block */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 space-y-2">
              {!isUser && openedDrawerTask.status === 'PENDING' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={(e) => handleAcceptRequest(openedDrawerTask, e)}
                    disabled={acceptingId === openedDrawerTask.id}
                    className="h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition text-white rounded text-xs font-bold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check size={13} />
                    <span>
                      {acceptingId === openedDrawerTask.id 
                        ? 'Accepting...' 
                        : drawerParsedMeta.original_task_id 
                          ? 'Accept Edit' 
                          : 'Accept Create'}
                    </span>
                  </button>

                  {openedDrawerTask.status !== 'REJECTED' && (
                    <button
                      onClick={(e) => handleRejectRequest(openedDrawerTask, e)}
                      disabled={rejectingId === openedDrawerTask.id}
                      className="h-10 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 hover:text-amber-850 disabled:opacity-50 transition rounded text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Ban size={13} />
                      <span>Reject request</span>
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleOpenEditModal(openedDrawerTask)}
                  className="h-10 border border-slate-205 text-slate-700 hover:bg-slate-100/80 transition bg-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Edit2 size={13} />
                  <span>{isDrawerOpeningRejected ? 'Edit & Re-approve' : 'Edit Request'}</span>
                </button>

                <button
                  onClick={(e) => handleDeleteRequest(openedDrawerTask.id, e)}
                  disabled={deletingId === openedDrawerTask.id}
                  className="h-10 border border-red-200 text-red-600 hover:bg-red-50 bg-white transition rounded text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Delete Request</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Create & Edit overlay Modal */}
      <CreateApproveTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          loadRequests();
          if (openedDrawerTask) {
            setOpenedDrawerTask(null);
          }
        }}
        taskToEdit={modalTask}
        taskToClone={taskToClone}
      />

      {/* Custom Rejection Reason Input Modal Dialog */}
      {isRejectDialogOpen && rejectDialogTask && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <h3 className="text-sm font-semibold text-slate-800">Reject Task Request</h3>
              <button 
                onClick={() => {
                  setIsRejectDialogOpen(false);
                  setRejectDialogTask(null);
                  setRejectReasonInput('');
                }} 
                className="p-1 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full transition-all"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-500 leading-relaxed">
                Please enter a brief rejection reason for the request <strong>"{rejectDialogTask.title}"</strong>. This feedback note will be shown to the creator to help them fix and re-approve.
              </p>
              
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block">Reason for Rejection (Lý do Reject)</label>
                <textarea
                  value={rejectReasonInput}
                  onChange={(e) => setRejectReasonInput(e.target.value)}
                  placeholder="e.g. Please clarify the subtask details or adjust estimated duration..."
                  rows={4}
                  className="w-full text-xs text-slate-750 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-sans leading-relaxed resize-none"
                />
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsRejectDialogOpen(false);
                  setRejectDialogTask(null);
                  setRejectReasonInput('');
                }}
                className="px-3 h-8 text-xs font-semibold text-slate-600 hover:bg-slate-150 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRejectRequest}
                disabled={rejectingId === rejectDialogTask.id || !rejectReasonInput.trim()}
                className="px-3 h-8 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded transition-colors flex items-center gap-1"
              >
                {rejectingId === rejectDialogTask.id ? 'Rejecting...' : 'Reject request'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ApproveTask;
