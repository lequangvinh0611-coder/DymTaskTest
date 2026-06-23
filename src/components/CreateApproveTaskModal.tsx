import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Trash2, Clock, Loader2, Plus, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../types';
import { logger } from '../lib/logger';
import { SearchableFilterSelect } from './ui/SearchableFilterSelect';
import { DateRangePicker } from './ui/DateRangePicker';

const getDatesInRange = (startDate: string, endDate: string): string[] => {
  if (!startDate) return [];
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date(startDate);
  
  const dates: string[] = [];
  let current = new Date(start);
  current.setHours(12, 0, 0, 0);
  const limit = new Date(end);
  limit.setHours(12, 0, 0, 0);
  
  while (current <= limit) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

// Helpers to detect or prevent emoji and icon characters
const hasEmoji = (str: string): boolean => {
  return /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F170}-\u{1F251}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u.test(str);
};

const removeEmojisAndIcons = (str: string): string => {
  return str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F170}-\u{1F251}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '');
};

const containsLink = (str: string): boolean => {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,6}(?:\/[^\s]*)?)/i;
  return urlRegex.test(str);
};

interface SubTask {
  id: string;
  content: string;
  assignee: string;
  est_time: number;
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
  todo_status?: string;
  todo_date?: string;
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

interface CreateApproveTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  taskToEdit?: DbApproveTask | null;
  taskToClone?: DbApproveTask | null;
  originalTaskId?: string | null;
}

const DAYS_OF_WEEK = [
  { label: 'Mo', value: 'Mon', fullName: 'Monday' },
  { label: 'Tu', value: 'Tue', fullName: 'Tuesday' },
  { label: 'We', value: 'Wed', fullName: 'Wednesday' },
  { label: 'Th', value: 'Thu', fullName: 'Thursday' },
  { label: 'Fr', value: 'Fri', fullName: 'Friday' }
];

const convertTo24h = (timeStr: string): string => {
  if (!timeStr) return '09:00';
  if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;

  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    let hours = parseInt(match[1]);
    const minutes = match[2];
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
  }
  return '09:00';
};

const convertToDisplayTime = (time24: string): string => {
  if (!time24) return '09:00 AM';
  const match = time24.trim().match(/^(\d{2}):(\d{2})$/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = match[2];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displHours = hours % 12 || 12;
    return `${String(displHours).padStart(2, '0')}:${minutes} ${ampm}`;
  }
  return time24;
};

const parseTaskDescription = (rawDescription: any): TaskMetadata => {
  const defaultMeta: TaskMetadata = {
    description: '',
    project_name: '',
    team_name: '',
    tag_name: '',
    deadline_time: '09:00 AM',
    deadline_days: 'Mon - Fri',
    sub_tasks: [],
    note: '',
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
      deadline_time: rawDescription.deadline_time || '09:00 AM',
      deadline_days: rawDescription.deadline_days || 'Mon - Fri',
      sub_tasks: Array.isArray(rawDescription.sub_tasks) ? rawDescription.sub_tasks : [],
      note: rawDescription.note || '',
      last_updated_by: rawDescription.last_updated_by || '',
      last_updated_at: rawDescription.last_updated_at || '',
      original_task_id: rawDescription.original_task_id || null,
      onetime_targets: rawDescription.onetime_targets || [],
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
          deadline_time: parsed.deadline_time || '09:00 AM',
          deadline_days: parsed.deadline_days || 'Mon - Fri',
          sub_tasks: Array.isArray(parsed.sub_tasks) ? parsed.sub_tasks : [],
          note: parsed.note || '',
          last_updated_by: parsed.last_updated_by || '',
          last_updated_at: parsed.last_updated_at || '',
          original_task_id: parsed.original_task_id || null,
          onetime_targets: parsed.onetime_targets || [],
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

const CreateApproveTaskModal: React.FC<CreateApproveTaskModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  taskToEdit, 
  taskToClone,
  originalTaskId
}) => {
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const isEditMode = !!taskToEdit;

  const [masterData, setMasterData] = useState<{
    projects: string[];
    teams: string[];
    tags: string[];
    assignees: string[];
  }>({
    projects: [],
    teams: [],
    tags: [],
    assignees: []
  });

  const [taskName, setTaskName] = useState('');
  const [project, setProject] = useState('');
  const [tag, setTag] = useState('');
  const [team, setTeam] = useState('');
  const [taskType, setTaskType] = useState('');
  const [note, setNote] = useState('');
  const [deadlineTime24h, setDeadlineTime24h] = useState('17:00');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [monthlyDays, setMonthlyDays] = useState('');
  const [oneTimeDate, setOneTimeDate] = useState('');
  const [onetimeStartDate, setOnetimeStartDate] = useState('');
  const [onetimeEndDate, setOnetimeEndDate] = useState('');
  const [onetimeTargets, setOnetimeTargets] = useState<{ id: string; date: string; time: string; todo_status?: string }[]>([
    { id: '1', date: '', time: '17:00' }
  ]);
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);

  // Keep onetimeTargets in sync with selected start/end dates and deadlineTime24h
  useEffect(() => {
    if (taskType === 'ONETIME' && onetimeStartDate) {
      const dates = getDatesInRange(onetimeStartDate, onetimeEndDate);
      const nextTargets = dates.map(dt => {
        const existing = onetimeTargets.find(t => t.date === dt);
        return {
          id: existing?.id || Math.random().toString(36).substring(2, 9),
          date: dt,
          time: deadlineTime24h || '17:00',
          todo_status: existing?.todo_status || 'NEW'
        };
      });
      setOnetimeTargets(nextTargets);
    }
  }, [onetimeStartDate, onetimeEndDate, deadlineTime24h, taskType]);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const fetchMasterData = async () => {
        try {
          const [projRes, teamRes, tagRes, userRes] = await Promise.all([
            supabase.from('projects').select('name').eq('is_active', true).order('name', { ascending: true }),
            supabase.from('teams').select('name').eq('is_active', true).order('name', { ascending: true }),
            supabase.from('tags').select('name').eq('is_active', true).order('name', { ascending: true }),
            supabase.from('users').select('name').eq('status', 'ACTIVE').order('name', { ascending: true })
          ]);

          const projectsList = (projRes.data || []).map((p: any) => p.name);
          const teamsList = (teamRes.data || []).map((t: any) => t.name);
          const tagsList = (tagRes.data || []).map((t: any) => t.name);
          const assigneesList = (userRes.data || []).map((u: any) => u.name);

          setMasterData({
            projects: projectsList,
            teams: teamsList,
            tags: tagsList,
            assignees: assigneesList
          });
        } catch (err) {
          console.error('Error fetching master data:', err);
        }
      };
      fetchMasterData();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      if (taskToEdit) {
        const meta = parseTaskDescription(taskToEdit.description);
        setTaskName(taskToEdit.title || '');
        setProject(meta.project_name || '');
        setTag(meta.tag_name || '');
        setTeam(meta.team_name || '');
        setTaskType(taskToEdit.task_type || '');
        setNote(meta.note || '');

        const currentDeadlineTime = meta.deadline_time || (taskToEdit as any).deadline_time || '';
        if (currentDeadlineTime) {
          setDeadlineTime24h(convertTo24h(currentDeadlineTime));
        } else {
          setDeadlineTime24h('');
        }

        const daysInput = meta.deadline_days || (taskToEdit as any).deadline_days || '';
        const daysStr = Array.isArray(daysInput) ? daysInput.join(', ') : String(daysInput || '');
        if (taskToEdit.task_type === 'DAILY') {
          // Default
        } else if (taskToEdit.task_type === 'WEEKLY') {
          const parsed = daysStr.split(/[\s,]+/).map(d => d.trim()).filter(d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(d));
          setSelectedDays(parsed);
        } else if (taskToEdit.task_type === 'MONTHLY') {
          setMonthlyDays(daysStr);
        } else if (taskToEdit.task_type === 'ONETIME') {
          setOneTimeDate(daysStr);
          const targets = meta.onetime_targets || [];
          if (targets.length > 0) {
            const sorted = [...targets].sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
            setOnetimeStartDate(sorted[0]?.date || '');
            setOnetimeEndDate(sorted[sorted.length - 1]?.date || '');
            setOnetimeTargets(targets.map((tgt: any) => ({
              id: tgt.id || Math.random().toString(36).substring(2, 9),
              date: tgt.date || '',
              time: convertTo24h(tgt.time)
            })));
          } else {
            setOnetimeStartDate(daysStr);
            setOnetimeEndDate(daysStr);
            setOnetimeTargets([{ id: '1', date: daysStr, time: convertTo24h(meta.deadline_time || (taskToEdit as any).deadline_time || '17:00') }]);
          }
        }

        setSubTasks(taskToEdit.sub_tasks || meta.sub_tasks || []);
      } else if (taskToClone) {
        const meta = parseTaskDescription(taskToClone.description);
        setTaskName(taskToClone.title || taskToClone.task_name || '');
        setProject(meta.project_name || taskToClone.project_name || '');
        setTag(meta.tag_name || taskToClone.tag_name || '');
        setTeam(meta.team_name || taskToClone.team_name || '');
        setTaskType(taskToClone.task_type || '');
        setNote(meta.note || '');

        const currentDeadlineTime = meta.deadline_time || (taskToClone as any).deadline_time || '';
        if (currentDeadlineTime) {
          setDeadlineTime24h(convertTo24h(currentDeadlineTime));
        } else {
          setDeadlineTime24h('');
        }

        const daysInput = meta.deadline_days || (taskToClone as any).deadline_days || '';
        const daysStr = Array.isArray(daysInput) ? daysInput.join(', ') : String(daysInput || '');
        if (taskToClone.task_type === 'DAILY') {
          // Default
        } else if (taskToClone.task_type === 'WEEKLY') {
          const parsed = daysStr.split(/[\s,]+/).map(d => d.trim()).filter(d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(d));
          setSelectedDays(parsed);
        } else if (taskToClone.task_type === 'MONTHLY') {
          setMonthlyDays(daysStr);
        } else if (taskToClone.task_type === 'ONETIME') {
          setOneTimeDate(daysStr);
          const targets = meta.onetime_targets || [];
          if (targets.length > 0) {
            const sorted = [...targets].sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
            setOnetimeStartDate(sorted[0]?.date || '');
            setOnetimeEndDate(sorted[sorted.length - 1]?.date || '');
            setOnetimeTargets(targets.map((tgt: any) => ({
              id: tgt.id || Math.random().toString(36).substring(2, 9),
              date: tgt.date || '',
              time: convertTo24h(tgt.time)
            })));
          } else {
            setOnetimeStartDate(daysStr);
            setOnetimeEndDate(daysStr);
            setOnetimeTargets([{ id: '1', date: daysStr, time: convertTo24h(meta.deadline_time || (taskToClone as any).deadline_time || '17:00') }]);
          }
        }

        const clonedSubtasks = (taskToClone.sub_tasks || meta.sub_tasks || taskToClone.subtasks || []).map((sb: any) => ({
          ...sb,
          id: originalTaskId ? sb.id : Math.random().toString(36).substring(2, 9),
          est_time: sb.est_time || sb.estimated_minutes || 0
        }));
        setSubTasks(clonedSubtasks);
      } else {
        setTaskName('');
        setProject('');
        setTag('');
        setTeam(profile?.team_ids?.[0] || 'No Team');
        setTaskType('');
        setNote('');
        setDeadlineTime24h('17:00');
        setSelectedDays([]);
        setMonthlyDays('');
        setOneTimeDate('');
        setOnetimeStartDate('');
        setOnetimeEndDate('');
        setOnetimeTargets([{ id: Math.random().toString(36).substring(2, 9), date: '', time: '17:00' }]);

        setSubTasks([{
          id: Math.random().toString(36).substring(2, 9),
          content: '',
          assignee: profile?.name || '',
          est_time: 60
        }]);
      }
    }
  }, [isOpen, taskToEdit, taskToClone, profile]);

  useEffect(() => {
    if (isOpen && !taskToEdit && !taskToClone && profile) {
      setTeam(profile.team_ids?.[0] || 'No Team');
    }
  }, [isOpen, taskToEdit, taskToClone, profile]);

  const handleToggleDay = (dayValue: string) => {
    let nextDays = [...selectedDays];
    if (nextDays.includes(dayValue)) {
      nextDays = nextDays.filter(d => d !== dayValue);
    } else {
      nextDays.push(dayValue);
    }
    const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const sorted = order.filter(d => nextDays.includes(d));
    setSelectedDays(sorted);
  };

  const handleAddSubTask = () => {
    const newSub: SubTask = {
      id: Math.random().toString(36).substring(2, 9),
      content: '',
      assignee: profile?.name || masterData.assignees[0] || '',
      est_time: 60
    };
    setSubTasks([...subTasks, newSub]);
  };

  const handleUpdateSubTaskField = (id: string, field: keyof SubTask, value: any) => {
    setSubTasks(subTasks.map(sub => {
      if (sub.id === id) {
        return { ...sub, [field]: value };
      }
      return sub;
    }));
  };

  const handleDeleteSubTask = (id: string) => {
    setSubTasks(subTasks.filter(sub => sub.id !== id));
  };

  const totalEstMinutes = useMemo(() => {
    return subTasks.reduce((sum, s) => sum + (Number(s.est_time) || Number((s as any).estimated_minutes) || 0), 0);
  }, [subTasks]);

  const assigneeOptions = useMemo(() => {
    return masterData.assignees.map(name => ({ value: name, label: name }));
  }, [masterData.assignees]);

  const isUnchanged = useMemo(() => {
    const sourceTask = taskToEdit || taskToClone;
    if (!sourceTask) return false;

    const sourceMeta = parseTaskDescription(sourceTask.description);
    
    if (taskName.trim().toLowerCase() !== (sourceTask.title || '').trim().toLowerCase()) return false;
    if (project !== (sourceMeta.project_name || '')) return false;
    if (team !== (sourceMeta.team_name || '')) return false;
    if (tag !== (sourceMeta.tag_name || '')) return false;
    if (taskType !== (sourceTask.task_type || '')) return false;
    if (note.trim().toLowerCase() !== (sourceMeta.note || '').trim().toLowerCase()) return false;
    
    const sourceTime24 = sourceMeta.deadline_time ? convertTo24h(sourceMeta.deadline_time) : '';
    if (deadlineTime24h !== sourceTime24) return false;
    
    if (taskType === 'WEEKLY') {
      const sourceDaysStr = sourceMeta.deadline_days || '';
      const sourceDays = sourceDaysStr.split(/[\s,]+/).map(d => d.trim()).filter(d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(d));
      const isWeeklyEqual = selectedDays.length === sourceDays.length && selectedDays.every((d, i) => d === sourceDays[i]);
      if (!isWeeklyEqual) return false;
    } else if (taskType === 'MONTHLY') {
      if (monthlyDays.trim() !== (sourceMeta.deadline_days || '').trim()) return false;
    } else if (taskType === 'ONETIME') {
      const sourceTargets = sourceMeta.onetime_targets || [];
      const sortedSource = [...sourceTargets].sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
      const sourceStart = sortedSource[0]?.date || sourceMeta.deadline_days || '';
      const sourceEnd = sortedSource[sortedSource.length - 1]?.date || sourceMeta.deadline_days || '';
      if (onetimeStartDate !== sourceStart || onetimeEndDate !== sourceEnd) return false;
    }
    
    const sourceSubtasks = sourceMeta.sub_tasks || [];
    if (subTasks.length !== sourceSubtasks.length) return false;
    const isSubtasksEqual = subTasks.every((st, idx) => {
      const orig = sourceSubtasks[idx];
      if (!orig) return false;
      return st.content.trim().toLowerCase() === orig.content.trim().toLowerCase() &&
             st.assignee === orig.assignee &&
             Number(st.est_time || (st as any).estimated_minutes) === Number(orig.est_time || (orig as any).estimated_minutes);
    });
    if (!isSubtasksEqual) return false;

    return true;
  }, [
    taskToEdit,
    taskToClone,
    taskName,
    project,
    team,
    tag,
    taskType,
    note,
    deadlineTime24h,
    selectedDays,
    monthlyDays,
    onetimeStartDate,
    onetimeEndDate,
    subTasks
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskName.trim()) {
      toast.warning('Please enter the Task Name.');
      return;
    }
    if (hasEmoji(taskName)) {
      toast.warning('Task Name cannot contain emojis.');
      return;
    }
    if (!project) {
      toast.warning('Please select a Project.');
      return;
    }
    if (!tag) {
      toast.warning('Please select a Tag.');
      return;
    }
    if (!taskType) {
      toast.warning('Please select a Task Type.');
      return;
    }
    if (!note.trim()) {
      toast.warning('Please enter the Note.');
      return;
    }
    if (!containsLink(note)) {
      toast.warning('Note must contain a valid URL (e.g. http://, https:// or www.).');
      return;
    }
    if (hasEmoji(note)) {
      toast.warning('Note cannot contain emojis.');
      return;
    }
    if (!deadlineTime24h) {
      toast.warning('Please select a Deadline time.');
      return;
    }
    if (taskType === 'WEEKLY' && selectedDays.length === 0) {
      toast.warning('Please select at least one Repeat day.');
      return;
    }
    if (taskType === 'MONTHLY') {
      if (!monthlyDays.trim()) {
        toast.warning('Please enter the Monthly repeat days.');
        return;
      }
      const parts = monthlyDays.trim().split(/[\s,]+/).map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        if (!/^\d+$/.test(part)) {
          toast.warning('Monthly repeat days must contain only numbers separated by commas or spaces.');
          return;
        }
        const num = parseInt(part, 10);
        if (num < 1 || num > 31) {
          toast.warning(`Invalid monthly repeat day: ${part}. Day must be between 1 and 31.`);
          return;
        }
      }
    }
    if (taskType === 'ONETIME') {
      if (!onetimeStartDate) {
        toast.warning('Please select a Deadline date.');
        return;
      }
      if (onetimeTargets.length === 0) {
        toast.warning('Please select a valid date range.');
        return;
      }
    }
    if (subTasks.length === 0) {
      toast.warning('Please add at least one sub-task.');
      return;
    }
    for (const sub of subTasks) {
      if (!sub.content.trim()) {
        toast.warning('Sub-task content cannot be empty.');
        return;
      }
      if (hasEmoji(sub.content)) {
        toast.warning('Sub-task content cannot contain emojis.');
        return;
      }
      if (!sub.assignee) {
        toast.warning('Sub-task assignee cannot be empty.');
        return;
      }
      const estVal = sub.est_time !== undefined ? sub.est_time : (sub as any).estimated_minutes;
      if (estVal !== undefined && estVal < 0) {
        toast.warning('Estimated time for the sub-task cannot be negative.');
        return;
      }
    }

    // Check if there are actual changes when editing or re-submitting
    const baseToCompare = taskToEdit || (originalTaskId ? taskToClone : null);
    if (baseToCompare) {
      const origMeta = parseTaskDescription(baseToCompare.description);
      const origTitle = baseToCompare.title || '';
      const origProject = origMeta.project_name || '';
      const origTag = origMeta.tag_name || '';
      const origTeam = origMeta.team_name || '';
      const origType = baseToCompare.task_type || '';
      const origNote = origMeta.note || '';
      const origTime = origMeta.deadline_time ? convertTo24h(origMeta.deadline_time) : '';

      // Check subtasks changes
      const origSubtasks = origMeta.sub_tasks || [];
      let isSubtasksChanged = false;
      if (origSubtasks.length !== subTasks.length) {
        isSubtasksChanged = true;
      } else {
        for (let i = 0; i < subTasks.length; i++) {
          const oSub = origSubtasks[i];
          const nSub = subTasks[i];
          if (!oSub || !nSub) {
            isSubtasksChanged = true;
            break;
          }
          if (
            oSub.content !== nSub.content || 
            oSub.assignee !== nSub.assignee || 
            (oSub.est_time || (oSub as any).estimated_minutes) !== (nSub.est_time || (nSub as any).estimated_minutes)
          ) {
            isSubtasksChanged = true;
            break;
          }
        }
      }

      // Check Repeat/Type changes
      let isRepeatChanged = false;
      if (taskType !== origType) {
        isRepeatChanged = true;
      } else {
        if (taskType === 'WEEKLY') {
          const origDaysStr = origMeta.deadline_days || '';
          const origDaysParsed = origDaysStr.split(/[\s,]+/).map(d => d.trim()).filter(Boolean);
          const currentDaysJoined = [...selectedDays].sort().join(',');
          const origDaysJoined = [...origDaysParsed].sort().join(',');
          if (currentDaysJoined !== origDaysJoined) {
            isRepeatChanged = true;
          }
        } else if (taskType === 'MONTHLY') {
          if (monthlyDays.trim() !== (origMeta.deadline_days || '').trim()) {
            isRepeatChanged = true;
          }
        } else if (taskType === 'ONETIME') {
          const sortedTargets = [...onetimeTargets].sort((a, b) => a.date.localeCompare(b.date));
          const firstDate = sortedTargets[0]?.date || '';
          const lastDate = sortedTargets[sortedTargets.length - 1]?.date || '';
          const computedDays = firstDate === lastDate ? firstDate : `${firstDate} ~ ${lastDate}`;
          if (computedDays !== (origMeta.deadline_days || '')) {
            isRepeatChanged = true;
          }
        }
      }

      const isNameChanged = taskName.trim() !== origTitle.trim();
      const isProjectChanged = project !== origProject;
      const isTagChanged = tag !== origTag;
      const isTeamChanged = team !== origTeam;
      const isNoteChanged = note.trim() !== origNote.trim();
      const isTimeChanged = deadlineTime24h !== origTime;

      const hasSomeChanges = 
        isNameChanged || 
        isProjectChanged || 
        isTagChanged || 
        isTeamChanged || 
        isNoteChanged || 
        isTimeChanged || 
        isSubtasksChanged || 
        isRepeatChanged;

      if (!hasSomeChanges) {
        toast.warning('No changes detected. Please modify at least one field to request approval for changes.');
        return;
      }
    }

    setLoading(true);
    try {
      const sortedTargets = [...onetimeTargets].sort((a, b) => a.date.localeCompare(b.date));
      let computedDeadlineDays = 'Mon - Fri';
      if (taskType === 'DAILY') {
        computedDeadlineDays = 'Mon - Fri';
      } else if (taskType === 'WEEKLY') {
        computedDeadlineDays = selectedDays.join(', ');
      } else if (taskType === 'MONTHLY') {
        computedDeadlineDays = monthlyDays;
      } else if (taskType === 'ONETIME') {
        const firstDate = sortedTargets[0]?.date || '';
        const lastDate = sortedTargets[sortedTargets.length - 1]?.date || '';
        computedDeadlineDays = firstDate === lastDate ? firstDate : `${firstDate} ~ ${lastDate}`;
      }

      const formattedDeadlineTime = convertToDisplayTime(taskType === 'ONETIME' ? (sortedTargets[0]?.time || '17:00') : deadlineTime24h);

      const oldMeta = (isEditMode && taskToEdit)
        ? parseTaskDescription(taskToEdit.description)
        : (originalTaskId && taskToClone)
          ? parseTaskDescription(taskToClone.description)
          : null;

      const reconcileSubtasksState = (existingSubs: any[] | undefined, templateSubs: SubTask[]): any[] => {
        if (!Array.isArray(existingSubs)) {
          return templateSubs.map(sf => ({
            ...sf,
            sub_status: 'New' as const,
            actual_time: sf.est_time || (sf as any).estimated_minutes
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
              est_time: templateSub.est_time || (templateSub as any).estimated_minutes,
              sub_status: existingSub.sub_status || 'New',
              actual_time: existingSub.actual_time !== undefined && existingSub.actual_time !== null ? existingSub.actual_time : (templateSub.est_time || (templateSub as any).estimated_minutes)
            };
          } else {
            return {
              ...templateSub,
              sub_status: 'New' as const,
              actual_time: templateSub.est_time || (templateSub as any).estimated_minutes
            };
          }
        });
      };

      const mappedOnetimeTargets = taskType === 'ONETIME' ? sortedTargets.map(tgt => {
        const existing = oldMeta?.onetime_targets?.find((t: any) => t.date === tgt.date);
        const isSubmitted = existing?.todo_status === 'DONE' || existing?.todo_status === 'SKIPPED';
        return {
          id: tgt.id,
          date: tgt.date,
          time: convertToDisplayTime(tgt.time),
          todo_status: existing?.todo_status || 'NEW',
          sub_tasks: isSubmitted 
            ? (existing?.sub_tasks || []) 
            : reconcileSubtasksState(existing?.sub_tasks, subTasks),
          actual_time: existing?.actual_time || 0,
          updated_by: existing?.updated_by,
          updated_at: existing?.updated_at
        };
      }) : undefined;

      // Propagate any subtask changes (like estimated_minutes) into existing completions
      const updatedCompletions = { ...(oldMeta?.completions || {}) };
      Object.keys(updatedCompletions).forEach(key => {
        const comp = updatedCompletions[key];
        // Protect already submitted completions
        if (comp && comp.todo_status !== 'DONE' && comp.todo_status !== 'SKIPPED' && Array.isArray(comp.sub_tasks)) {
          comp.sub_tasks = reconcileSubtasksState(comp.sub_tasks, subTasks);
        }
      });

      const metadata: TaskMetadata = {
        description: '',
        project_name: project,
        team_name: team,
        tag_name: tag,
        deadline_time: formattedDeadlineTime,
        deadline_days: computedDeadlineDays,
        sub_tasks: subTasks,
        note: note.trim(),
        todo_date: taskType === 'ONETIME' ? (sortedTargets[0]?.date || '') : undefined,
        todo_status: taskType === 'ONETIME' ? 'NEW' : undefined,
        last_updated_by: profile?.name || 'Unknown',
        last_updated_at: new Date().toISOString(),
        original_task_id: originalTaskId || (taskToEdit ? (taskToEdit.description as any)?.original_task_id : null),
        onetime_targets: mappedOnetimeTargets,
        completions: updatedCompletions,
        versions: oldMeta?.versions || []
      };

      let unifiedHistory: any[] = [];
      const todayDateStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayDateStr = new Date(yesterdayDate.getTime() - yesterdayDate.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

      if (originalTaskId && taskToClone) {
        // Collect current history of original task
        const originalHistory = Array.isArray((taskToClone as any).history) 
          ? (taskToClone as any).history 
          : (taskToClone.description ? (parseTaskDescription(taskToClone.description)?.versions || []) : []);
          
        // Build revision snapshot of current active state
        const origMeta = parseTaskDescription(taskToClone.description);
        const current_valid_from = origMeta?.last_updated_at
          ? origMeta.last_updated_at.split('T')[0]
          : (taskToClone.created_at ? taskToClone.created_at.split('T')[0] : todayDateStr);

        const oldVersionSnapshot = {
          valid_from: current_valid_from,
          valid_until: yesterdayDateStr,
          title: taskToClone.title || taskToClone.task_name || '',
          description: origMeta?.note || origMeta?.description || '',
          project_name: taskToClone.project_name || origMeta?.project_name || '',
          team_name: taskToClone.team_name || origMeta?.team_name || '',
          tag_name: taskToClone.tag_name || origMeta?.tag_name || '',
          deadline_time: taskToClone.deadline_time || origMeta?.deadline_time || '',
          deadline_days: Array.isArray(taskToClone.deadline_days) 
            ? taskToClone.deadline_days.join(', ') 
            : String(taskToClone.deadline_days || origMeta?.deadline_days || ''),
          est_time: Number(taskToClone.est_time || taskToClone.estimated_minutes || 0),
          sub_tasks: (taskToClone.subtasks || origMeta?.sub_tasks || []).map((sub: any) => ({
            id: sub.id,
            content: sub.content || sub.name || '',
            assignee: sub.assignee || '',
            est_time: sub.est_time !== undefined ? sub.est_time : (sub.estimated_minutes || 0)
          }))
        };

        unifiedHistory = [...originalHistory, oldVersionSnapshot];
      }

      const payload = {
        title: taskName.trim(),
        description: metadata,
        task_type: taskType,
        est_time: totalEstMinutes,
        status: 'PENDING', // Reset status as PENDING on create or edit/re-approve
        actual_time: 0,
        user_id: profile?.id || null,
        history: isEditMode && taskToEdit ? (taskToEdit as any).history || [] : unifiedHistory
      };

      if (isEditMode && taskToEdit) {
        const { error } = await supabase
          .from('approve_tasks')
          .update(payload)
          .eq('id', taskToEdit.id);

        if (error) throw error;
        await logger.log('EDIT_APPROVE_TASK_REQUEST', `Edited task request: ${taskName.trim()} with PENDING state`, { approveTaskId: taskToEdit.id });
        toast.success('Your request was modified and submitted for re-approval successfully!');
      } else {
        const { data, error } = await supabase
          .from('approve_tasks')
          .insert([payload])
          .select('id')
          .single();

        if (error) throw error;
        
        if (originalTaskId) {
          await logger.log('SUBMIT_APPROVE_TASK_REQUEST', `Submitted template edit request [Approve Edit]: ${taskName.trim()}`, { approveTaskId: data?.id });
          toast.success('Your request for template changes has been submitted for approval!');
        } else {
          await logger.log('SUBMIT_APPROVE_TASK_REQUEST', `Submitted new task creation request [Approve Create]: ${taskName.trim()}`, { approveTaskId: data?.id });
          toast.success('Your request for task creation has been submitted for approval!');
        }
      }

      await useAppStore.getState().fetchApproveTasks(true);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving approve request task:', err);
      toast.error(`Database Error: ${err.message || 'Error occurred while saving request'}`);
    } finally {
      setLoading(false);
    }
  };

  const backdropClickedRef = useRef(false);

  if (!isOpen) return null;

  const isRejectedState = taskToEdit?.status === 'REJECTED';

  return (
    <div 
      onMouseDown={(e) => { if (e.target === e.currentTarget) backdropClickedRef.current = true; }}
      onMouseUp={(e) => { 
        if (e.target === e.currentTarget && backdropClickedRef.current) onClose();
        backdropClickedRef.current = false;
      }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              {originalTaskId 
                ? 'Approve Edit - Change Template' 
                : isEditMode 
                  ? (isRejectedState ? 'Edit & Re-approve' : 'Edit Request') 
                  : 'Approve Create - New Template'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-left">
          
          {/* Task Name */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Task name</label>
            <input 
              required 
              type="text"
              className="w-full h-8 px-3 bg-white border border-slate-200 focus:border-indigo-500 rounded-md text-xs font-medium focus:outline-none transition-all text-slate-800 shadow-sm"
              placeholder="Enter task template name..." 
              value={taskName} 
              onChange={(e) => setTaskName(removeEmojisAndIcons(e.target.value))} 
            />
          </div>

          {/* Project, Tag, Task Type dropdowns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Project</label>
              <select 
                required
                className="w-full h-8 px-2 bg-white border border-slate-200 rounded-md text-xs font-medium focus:outline-none focus:border-indigo-500 cursor-pointer text-slate-700"
                value={project} 
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">-- Choose Project --</option>
                {masterData.projects.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tag</label>
              <select 
                required
                className="w-full h-8 px-2 bg-white border border-slate-200 rounded-md text-xs font-medium focus:outline-none focus:border-indigo-500 cursor-pointer text-slate-700"
                value={tag} 
                onChange={(e) => setTag(e.target.value)}
              >
                <option value="">-- Choose Tag --</option>
                {masterData.tags.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Task type</label>
              <select 
                required
                disabled={isEditMode || !!originalTaskId}
                className="w-full h-8 px-2 bg-white border border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed rounded-md text-xs font-medium focus:outline-none focus:border-indigo-500 cursor-pointer text-slate-700"
                value={taskType} 
                onChange={(e) => {
                  setTaskType(e.target.value);
                  setSelectedDays([]);
                  setMonthlyDays('');
                  setOneTimeDate('');
                }}
              >
                <option value="">-- Choose Task type --</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="ONETIME">Onetime</option>
              </select>
            </div>
          </div>

          {/* Dynamic Conditional Settings Panel (Always full sizing layout for unified UX) */}
          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end min-h-[58px]">
              {/* Left Column: Deadline Time is always visible */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Deadline time</label>
                <input 
                  required 
                  disabled={!taskType}
                  type="time"
                  className="w-full h-8 px-3 bg-white border border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 rounded-md text-xs font-mono font-medium focus:outline-none focus:border-indigo-500 text-slate-700 shadow-sm"
                  value={deadlineTime24h} 
                  onChange={(e) => setDeadlineTime24h(e.target.value)} 
                />
              </div>

              {/* Right Column: Contextual Deadline Setting */}
              <div className="min-h-[48px] flex flex-col justify-end">
                {taskType === '' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Deadline detail</label>
                    <div className="w-full h-8 px-3 bg-slate-100/60 border border-slate-200/50 rounded-md text-xs flex items-center gap-1.5 text-slate-400 font-normal italic">
                      <Calendar size={12} className="shrink-0" />
                      <span>Choose Task type to configure</span>
                    </div>
                  </div>
                )}

                {taskType === 'DAILY' && (
                  <div>
                    <span className="block text-xs font-medium text-slate-500 mb-1">Deadline days</span>
                    <div className="w-full h-8 flex items-center">
                      <p className="text-xs font-normal text-slate-500 italic">
                        Triggered everyday Mon - Fri (Sat & Sun optional)
                      </p>
                    </div>
                  </div>
                )}

                {taskType === 'WEEKLY' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Repeat days</label>
                    <div className="flex items-center gap-1 h-8">
                      {DAYS_OF_WEEK.map((day) => {
                        const isActive = selectedDays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            title={day.fullName}
                            onClick={() => handleToggleDay(day.value)}
                            className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-semibold transition-all cursor-pointer border ${
                              isActive 
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                                : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300'
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {taskType === 'MONTHLY' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Monthly repeat days</label>
                    <input 
                      required 
                      type="text"
                      className="w-full h-8 px-3 bg-white border border-slate-200 rounded-md text-xs font-medium focus:outline-none focus:border-indigo-500 text-slate-800 shadow-sm"
                      placeholder="e.g. 10, 15, 20" 
                      value={monthlyDays} 
                      onChange={(e) => {
                        const sanitized = e.target.value.replace(/[^0-9,\s]/g, '');
                        setMonthlyDays(sanitized);
                      }} 
                    />
                  </div>
                )}

                {taskType === 'ONETIME' && (
                  <div className="flex flex-col w-full relative">
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Deadline days (Date Range)</label>
                    <DateRangePicker
                      startDate={onetimeStartDate}
                      endDate={onetimeEndDate}
                      onChange={(start, end) => {
                        setOnetimeStartDate(start);
                        setOnetimeEndDate(end);
                      }}
                      className="w-full text-slate-700"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Reference Notes / URL */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Note
            </label>
            <input 
              required 
              type="text"
              className="w-full h-8 px-3 bg-white border border-slate-200 focus:border-indigo-500 rounded-md text-xs font-medium focus:outline-none transition-all text-slate-800 shadow-sm"
              placeholder="Enter note / URL (must not be empty)..." 
              value={note} 
              onChange={(e) => setNote(removeEmojisAndIcons(e.target.value))} 
            />
          </div>

          {/* Sub-tasks management (FLEXBOX HORIZONTAL ONE-ROW) */}
          <div className="border border-slate-200 bg-slate-50/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-500">Sub-tasks management</span>
              <button 
                type="button" 
                onClick={handleAddSubTask}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 bg-blue-50 px-2.5 h-7 rounded border border-blue-100 transition-colors"
              >
                <Plus size={12} />
                <span>Add row</span>
              </button>
            </div>

            {/* Sub-task List Area with Header */}
            {subTasks.length > 0 && (
              <div className="hidden md:flex flex-row items-center gap-4 px-2 text-xs font-medium text-slate-400">
                <div className="flex-1">Sub-task content</div>
                <div className="w-48">Assignee</div>
                <div className="w-24 text-center">Est. min</div>
                <div className="w-10"></div>
              </div>
            )}

            <div className="space-y-2 overflow-visible pr-1">
              {subTasks.length > 0 ? (
                subTasks.map((sub, index) => (
                  <div 
                    key={sub.id} 
                    style={{ zIndex: activeDropdownId === sub.id ? 99 : (subTasks.length - index) }}
                    className="flex flex-col md:flex-row md:items-center gap-2 w-full bg-white border border-slate-100 rounded-md p-2 hover:border-blue-100/80 hover:shadow-sm transition-all animate-in fade-in relative"
                  >
                    {/* Content */}
                    <div className="flex-1">
                      <input 
                        required
                        type="text" 
                        value={sub.content}
                        className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium text-slate-700 focus:outline-none focus:bg-white focus:border-indigo-400 transition-all"
                        placeholder="Content"
                        onChange={(e) => handleUpdateSubTaskField(sub.id, 'content', removeEmojisAndIcons(e.target.value))}
                      />
                    </div>

                    {/* Assignee Selection dropdown with Search */}
                    <div className="w-full md:w-48">
                      <SearchableFilterSelect
                        placement="top"
                        value={sub.assignee}
                        onChange={(val) => handleUpdateSubTaskField(sub.id, 'assignee', val)}
                        defaultOptionLabel="-- Choose Assignee --"
                        options={assigneeOptions}
                        onOpenChange={(isOpen) => {
                          if (isOpen) {
                            setActiveDropdownId(sub.id);
                          } else {
                            setActiveDropdownId((prev) => (prev === sub.id ? null : prev));
                          }
                        }}
                      />
                    </div>

                    {/* Estimated minutes standard count */}
                    <div className="w-full md:w-24">
                      <input 
                        type="number" 
                        min={0}
                        max={10000}
                        value={(sub.est_time === undefined ? '' : (sub.est_time === 0 ? '' : sub.est_time))}
                        className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium text-slate-700 focus:outline-none focus:bg-white focus:border-indigo-400 font-mono text-center"
                        placeholder="Min"
                        onChange={(e) => {
                          const val = Math.min(10000, Math.max(0, parseInt(e.target.value) || 0));
                          handleUpdateSubTaskField(sub.id, 'est_time', val);
                        }}
                      />
                    </div>

                    {/* Action delete bin */}
                    <div className="w-full md:w-10 flex items-center justify-end md:justify-center">
                      <button 
                        type="button"
                        disabled={subTasks.length <= 1}
                        onClick={() => handleDeleteSubTask(sub.id)}
                        className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors border border-transparent hover:border-red-100 cursor-pointer"
                        title="Remove row"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs italic font-medium bg-slate-50/50 rounded-md border border-dashed border-slate-200 select-none">
                  Click "+ Add Row" to add your sub-tasks.
                </div>
              )}
            </div>

            {/* Total Minutes display */}
            <div className="flex justify-between items-center pt-2 border-t border-slate-100 font-mono">
              <span className="text-xs text-slate-400 font-medium font-sans">Sub-tasks total value</span>
              <span className="text-xs font-semibold text-slate-700">
                Total est: <span className="text-blue-600 font-bold">{totalEstMinutes}</span> min
              </span>
            </div>
          </div>

          {/* BOTTOM COMMAND TRIGGERS */}
          <div className="pt-2 flex gap-3 shrink-0">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 h-8 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-all text-center cursor-pointer border border-slate-200"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading || isUnchanged} 
              className="flex-1 h-8 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              title={isUnchanged ? "No changes to submit" : ""}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : null}
              <span>
                {originalTaskId 
                  ? 'Approve Edit' 
                  : isEditMode 
                    ? 'Re-approve' 
                    : 'Approve Create'}
              </span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

export default CreateApproveTaskModal;
