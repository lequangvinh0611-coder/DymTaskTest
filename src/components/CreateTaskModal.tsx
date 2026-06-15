import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Trash2, Clock, Loader2, Plus, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { useAuthStore } from '../store/authStore';
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

// Helpers to detect or prevent emoji and icon characters (Option 2)
const hasEmoji = (str: string): boolean => {
  return /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F170}-\u{1F251}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/u.test(str);
};

const removeEmojisAndIcons = (str: string): string => {
  return str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F170}-\u{1F251}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '');
};

const containsLink = (str: string): boolean => {
  // Matches typical link representations: http://, https://, www., or custom URL formats
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,6}(?:\/[^\s]*)?)/i;
  return urlRegex.test(str);
};

// TS interfaces matching the schema
interface SubTask {
  id: string;
  content: string;
  assignee: string;
  estimated_minutes: number;
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
  versions?: TaskVersion[];
  completions?: Record<string, any>;
  onetime_targets?: any[];
}

interface DbTask {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  status: string; // 'ON' / 'OFF' for template switcher
  is_active: boolean;
  est_time: number;
  actual_time: number;
  created_at: string;
  display_id?: number | null;
}

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  taskToEdit?: DbTask | null;
  taskToClone?: DbTask | null;
}

const DAYS_OF_WEEK = [
  { label: 'Mo', value: 'Mon', fullName: 'Monday' },
  { label: 'Tu', value: 'Tue', fullName: 'Tuesday' },
  { label: 'We', value: 'Wed', fullName: 'Wednesday' },
  { label: 'Th', value: 'Thu', fullName: 'Thursday' },
  { label: 'Fr', value: 'Fri', fullName: 'Friday' }
];

// Conversions for 24h input format to AM/PM and vice versa
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
    versions: [],
    completions: {}
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
      versions: rawDescription.versions || [],
      completions: rawDescription.completions || {},
      onetime_targets: rawDescription.onetime_targets || []
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
          versions: parsed.versions || [],
          completions: parsed.completions || {},
          onetime_targets: parsed.onetime_targets || []
        };
      } catch {
        // JSON format issue, fallback to normal values
      }
    }
  }

  return {
    ...defaultMeta,
    description: String(rawDescription)
  };
};

const serializeTaskDescription = (metadata: TaskMetadata): any => {
  return metadata;
};

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ isOpen, onClose, onSuccess, taskToEdit, taskToClone }) => {
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

  // Form states matching mockup & requirements
  const [taskName, setTaskName] = useState('');
  const [project, setProject] = useState('');
  const [tag, setTag] = useState('');
  const [team, setTeam] = useState('');
  const [taskType, setTaskType] = useState('');
  const [note, setNote] = useState('');

  // Time is managed as 24h internally ("09:00" etc.)
  const [deadlineTime24h, setDeadlineTime24h] = useState('17:00');

  // Inputs depending on selected type
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [monthlyDays, setMonthlyDays] = useState('');
  const [oneTimeDate, setOneTimeDate] = useState('');
  const [onetimeStartDate, setOnetimeStartDate] = useState('');
  const [onetimeEndDate, setOnetimeEndDate] = useState('');
  const [onetimeTargets, setOnetimeTargets] = useState<{ id: string; date: string; time: string; todo_status?: string }[]>([
    { id: '1', date: '', time: '17:00' }
  ]);

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

  // Subtasks list
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);

  // State to track which subtask's dropdown select is currently active
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);

  // Fetch Master Data on open
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
          console.error('Error fetching master data for CreateTaskModal:', err);
        }
      };
      fetchMasterData();
    }
  }, [isOpen]);

  // Sync / Reset on mount / edit trigger & master data load
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

        // Parse structures matching exact time elements
        const currentDeadlineTime = meta.deadline_time || '';
        if (currentDeadlineTime) {
          setDeadlineTime24h(convertTo24h(currentDeadlineTime));
        } else {
          setDeadlineTime24h('');
        }

         const daysStr = meta.deadline_days || '';
        if (taskToEdit.task_type === 'DAILY') {
          // Defaults
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
            setOnetimeTargets([{ id: '1', date: daysStr, time: convertTo24h(meta.deadline_time || '17:00') }]);
          }
        }

        setSubTasks(meta.sub_tasks || []);
      } else if (taskToClone) {
        const meta = parseTaskDescription(taskToClone.description);
        // Prefix title to indicate it's custom clone or just keep the same name as you requested: "dùng lại toàn bộ thông tin của task đó (khác task ID)"
        setTaskName(taskToClone.title || '');
        setProject(meta.project_name || '');
        setTag(meta.tag_name || '');
        setTeam(meta.team_name || '');
        setTaskType(taskToClone.task_type || '');
        setNote(meta.note || '');

        const currentDeadlineTime = meta.deadline_time || '';
        if (currentDeadlineTime) {
          setDeadlineTime24h(convertTo24h(currentDeadlineTime));
        } else {
          setDeadlineTime24h('');
        }

        const daysStr = meta.deadline_days || '';
        if (taskToClone.task_type === 'DAILY') {
          // Defaults
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
            setOnetimeTargets([{ id: '1', date: daysStr, time: convertTo24h(meta.deadline_time || '17:00') }]);
          }
        }

        // Generate brand new client IDs for sub_tasks to prevent overlap key rendering references
        const clonedSubtasks = (meta.sub_tasks || []).map((sb: any) => ({
          ...sb,
          id: Math.random().toString(36).substring(2, 9)
        }));
        setSubTasks(clonedSubtasks);
      } else {
        // Reset inputs on Create New to empty / unselected as requested
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
          estimated_minutes: 60
        }]);
      }
    }
  }, [isOpen, taskToEdit, taskToClone, profile]);

  // Sync team whenever profile is available/changed if not in edit/clone mode
  useEffect(() => {
    if (isOpen && !taskToEdit && !taskToClone && profile) {
      setTeam(profile.team_ids?.[0] || 'No Team');
    }
  }, [isOpen, taskToEdit, taskToClone, profile]);

  // Handle Quick Day selection toggle for WEEKLY type
  const handleToggleDay = (dayValue: string) => {
    let nextDays = [...selectedDays];
    if (nextDays.includes(dayValue)) {
      nextDays = nextDays.filter(d => d !== dayValue);
    } else {
      nextDays.push(dayValue);
    }
    // Maintain sorted calendar order
    const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const sorted = order.filter(d => nextDays.includes(d));
    setSelectedDays(sorted);
  };

  // Subtask helpers
  const handleAddSubTask = () => {
    const newSub: SubTask = {
      id: Math.random().toString(36).substring(2, 9),
      content: '',
      assignee: profile?.name || masterData.assignees[0] || '',
      estimated_minutes: 60
    };
    setSubTasks([...subTasks, newSub]);
  };

  const handleUpdateSubTaskField = (id: string, field: keyof SubTask, value: any) => {
    setSubTasks(subTasks.map(sub => {
      if (sub.id === id) {
        return {
          ...sub,
          [field]: value
        };
      }
      return sub;
    }));
  };

  const handleDeleteSubTask = (id: string) => {
    setSubTasks(subTasks.filter(sub => sub.id !== id));
  };

  // Total estimation sum
  const totalEstMinutes = useMemo(() => {
    return subTasks.reduce((sum, s) => sum + (Number(s.estimated_minutes) || 0), 0);
  }, [subTasks]);

  const assigneeOptions = useMemo(() => {
    return masterData.assignees.map(name => ({ value: name, label: name }));
  }, [masterData.assignees]);

  // Form submit callback handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!taskName.trim()) {
      toast.warning('Please enter the Task Name.');
      return;
    }
    if (hasEmoji(taskName)) {
      toast.warning('Task Name cannot contain emojis or icons.');
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
      toast.warning('Please enter the Note (cannot be empty).');
      return;
    }
    if (!containsLink(note)) {
      toast.warning('Note must contain a valid URL/link (e.g. http://, https:// or www.).');
      return;
    }
    if (hasEmoji(note)) {
      toast.warning('Note cannot contain emojis or icons.');
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
      const clean = monthlyDays.trim();
      const parts = clean.split(/[\s,]+/).map(p => p.trim()).filter(p => p.length > 0);
      if (parts.length === 0) {
        toast.warning('Monthly repeat days must contain at least one day number.');
        return;
      }
      for (const part of parts) {
        if (!/^\d+$/.test(part)) {
          toast.warning('Monthly repeat days must contain only numbers between 1 and 31 separated by commas or spaces (no letters or indicators allowed).');
          return;
        }
        const num = parseInt(part, 10);
        if (num < 1 || num > 31) {
          toast.warning(`Invalid monthly repeat day: ${part}. Days must be between 1 and 31.`);
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
        toast.warning('Sub-task content cannot contain emojis or icons.');
        return;
      }
      if (!sub.assignee) {
        toast.warning('Sub-task assignee cannot be empty.');
        return;
      }
      if (sub.estimated_minutes !== undefined && sub.estimated_minutes < 0) {
        toast.warning('Estimated time for the sub-task cannot be negative.');
        return;
      }
    }

    setLoading(true);
    try {
      // Compute the deadline days string context
      const sortedTargets = [...onetimeTargets].sort((a, b) => a.date.localeCompare(b.date));
      let computedDeadlineDays = 'Mon - Fri';
      if (taskType === 'DAILY') {
        computedDeadlineDays = 'Mon - Fri';
      } else if (taskType === 'WEEKLY') {
        computedDeadlineDays = selectedDays.join(', ');
      } else if (taskType === 'MONTHLY') {
        computedDeadlineDays = monthlyDays || '10, 20';
      } else if (taskType === 'ONETIME') {
        const firstDate = sortedTargets[0]?.date || '';
        const lastDate = sortedTargets[sortedTargets.length - 1]?.date || '';
        computedDeadlineDays = firstDate === lastDate ? firstDate : `${firstDate} ~ ${lastDate}`;
      }

      const formattedDeadlineTime = convertToDisplayTime(taskType === 'ONETIME' ? (sortedTargets[0]?.time || '17:00') : deadlineTime24h);

      const getTodayDateString = (): string => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const getYesterdayDateString = (todayStr: string): string => {
        const d = new Date(todayStr);
        d.setDate(d.getDate() - 1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const todayStr = getTodayDateString();
      const yesterdayStr = getYesterdayDateString(todayStr);

      const oldMeta = isEditMode && taskToEdit ? parseTaskDescription(taskToEdit.description) : null;
      let updatedVersions = oldMeta?.versions || [];

      if (isEditMode && taskToEdit && oldMeta) {
        const current_valid_from = oldMeta.last_updated_at
          ? oldMeta.last_updated_at.split('T')[0]
          : (taskToEdit.created_at ? taskToEdit.created_at.split('T')[0] : todayStr);

        if (current_valid_from <= yesterdayStr) {
          const oldVersion: TaskVersion = {
            valid_from: current_valid_from,
            valid_until: yesterdayStr,
            title: taskToEdit.title,
            description: oldMeta.description || '',
            project_name: oldMeta.project_name,
            team_name: oldMeta.team_name,
            tag_name: oldMeta.tag_name,
            deadline_time: oldMeta.deadline_time,
            deadline_days: oldMeta.deadline_days,
            est_time: taskToEdit.est_time,
            sub_tasks: oldMeta.sub_tasks || []
          };
          updatedVersions = [...updatedVersions, oldVersion];
        }
      }

      const reconcileSubtasksState = (existingSubs: any[] | undefined, templateSubs: SubTask[]): any[] => {
        if (!Array.isArray(existingSubs)) {
          return templateSubs.map(sf => ({
            ...sf,
            sub_status: 'New' as const,
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
              sub_status: 'New' as const,
              actual_minutes: templateSub.estimated_minutes
            };
          }
        });
      };

      // Propagate any subtask changes (like estimated_minutes) into existing completions
      const updatedCompletions = { ...(oldMeta?.completions || {}) };
      Object.keys(updatedCompletions).forEach(key => {
        const comp = updatedCompletions[key];
        // Protect already submitted completions
        if (comp && comp.todo_status !== 'DONE' && comp.todo_status !== 'SKIPPED' && Array.isArray(comp.sub_tasks)) {
          comp.sub_tasks = reconcileSubtasksState(comp.sub_tasks, subTasks);
        }
      });

      const mappedOnetimeTargets = taskType === 'ONETIME' ? sortedTargets.map(tgt => {
        const existing = oldMeta?.onetime_targets?.find((t: any) => t.date === tgt.date);
        const rootStatus = oldMeta?.todo_status || taskToEdit?.todo_status || 'NEW';
        
        let targetStatus = 'NEW';
        if (existing) {
          targetStatus = existing.todo_status || 'NEW';
        } else if (tgt.date === taskToEdit?.todo_date || tgt.date === oldMeta?.todo_date) {
          targetStatus = rootStatus;
        }

        const isSubmitted = targetStatus === 'DONE' || targetStatus === 'SKIPPED';
        const preservedSubTasks = existing?.sub_tasks || (isSubmitted ? (oldMeta?.sub_tasks || taskToEdit?.sub_tasks || []) : undefined);

        return {
          id: tgt.id,
          date: tgt.date,
          time: convertToDisplayTime(tgt.time),
          todo_status: targetStatus,
          sub_tasks: isSubmitted 
            ? (preservedSubTasks || []) 
            : reconcileSubtasksState(preservedSubTasks, subTasks),
          actual_time: existing?.actual_time !== undefined ? existing.actual_time : (isSubmitted ? ((taskToEdit as any)?.actual_time || 0) : 0),
          updated_by: existing?.updated_by || (isSubmitted ? (oldMeta?.last_updated_by || (taskToEdit as any)?.last_updated_by) : undefined),
          updated_at: existing?.updated_at || (isSubmitted ? (oldMeta?.last_updated_at || (taskToEdit as any)?.last_updated_at) : undefined)
        };
      }) : undefined;

      const hasUnfinishedTarget = taskType === 'ONETIME'
        ? (mappedOnetimeTargets?.some(t => t.todo_status === 'NEW'))
        : true;

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
        todo_status: taskType === 'ONETIME' ? (hasUnfinishedTarget ? 'NEW' : 'DONE') : undefined,
        last_updated_by: profile?.name || 'Unknown',
        last_updated_at: new Date().toISOString(),
        completions: updatedCompletions,
        versions: updatedVersions,
        onetime_targets: mappedOnetimeTargets
      };

      const payload = {
        title: taskName.trim(),
        description: serializeTaskDescription(metadata),
        task_type: taskType,
        est_time: totalEstMinutes,
        status: hasUnfinishedTarget ? 'ON' : 'OFF',
        is_active: !!hasUnfinishedTarget,
        actual_time: isEditMode && taskToEdit ? taskToEdit.actual_time : 0
      };

      if (isEditMode && taskToEdit) {
        const { error } = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', taskToEdit.id);

        if (error) throw error;
        const displayId = taskToEdit.display_id ? String(taskToEdit.display_id).padStart(6, '0') : '';
        const idSuffix = displayId ? ` [${displayId}]` : '';
        await logger.log('UPDATE_TASK_TEMPLATE', `Updated task template${idSuffix}: ${taskName.trim()}`, { taskId: taskToEdit.id, payload });
      } else {
        const { data, error } = await supabase
          .from('tasks')
          .insert([payload])
          .select('id, display_id')
          .single();

        if (error) throw error;
        const displayId = data && data.display_id ? String(data.display_id).padStart(6, '0') : '';
        const idSuffix = displayId ? ` [${displayId}]` : '';
        await logger.log('CREATE_TASK_TEMPLATE', `Created task template${idSuffix}: ${taskName.trim()}`, { taskId: data?.id, payload });
      }

      toast.success(isEditMode ? 'Success updating template!' : 'Success creating template!');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving task template:', err);
      toast.error(`Error context: ${err.message || 'Unknown database issue'}`);
    } finally {
      setLoading(false);
    }
  };

  const backdropClickedRef = useRef(false);

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      backdropClickedRef.current = true;
    } else {
      backdropClickedRef.current = false;
    }
  };

  const handleBackdropMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && backdropClickedRef.current) {
      onClose();
    }
    backdropClickedRef.current = false;
  };

  if (!isOpen) return null;

  return (
    <div 
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150">
        
        {/* 1. HEADER SECTION */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-4">
            <h3 className="text-sm font-semibold text-slate-800">
              {isEditMode ? 'Edit template' : taskToClone ? 'Quick Create task template' : 'Create new template'}
            </h3>
          </div>

          <button onClick={onClose} className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. FORM BODY COVER */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-left">
          
          {/* HÀNG 1: Task Name */}
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

          {/* HÀNG 2: Grid Dropdowns - Project, Tag, Task Type */}
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
                {masterData.projects.map(proj => (
                  <option key={proj} value={proj}>{proj}</option>
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
                {masterData.tags.map(tg => (
                  <option key={tg} value={tg}>{tg}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Task type</label>
              <select 
                required
                disabled={isEditMode}
                className="w-full h-8 px-2 bg-white border border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed rounded-md text-xs font-medium focus:outline-none focus:border-indigo-500 cursor-pointer text-slate-700"
                value={taskType} 
                onChange={(e) => setTaskType(e.target.value)}
              >
                <option value="">-- Choose Task type --</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="ONETIME">Onetime</option>
              </select>
            </div>
          </div>

          {/* HÀNG 3: Dynamic Conditional Settings Panel (Always full sizing layout for unified UX) */}
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

          {/* HÀNG BỔ SUNG: Note (đa phần URL) */}
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

          {/* HÀNG 4: Sub-tasks management (FLEXBOX HORIZONTAL ONE-ROW) */}
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
                        value={sub.estimated_minutes === 0 ? '' : sub.estimated_minutes}
                        className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-md text-xs font-medium text-slate-700 focus:outline-none focus:bg-white focus:border-indigo-400 font-mono text-center"
                        placeholder="Min"
                        onChange={(e) => {
                          const val = Math.min(10000, Math.max(0, parseInt(e.target.value) || 0));
                          handleUpdateSubTaskField(sub.id, 'estimated_minutes', val);
                        }}
                      />
                    </div>

                    {/* Action delete bin */}
                    <div className="w-full md:w-10 flex items-center justify-end md:justify-center">
                      <button 
                        type="button"
                        onClick={() => handleDeleteSubTask(sub.id)}
                        className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors border border-transparent hover:border-red-100"
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
              <span className="text-xs text-slate-400 font-medium">Sub-tasks total value</span>
              <span className="text-xs font-semibold text-slate-700">
                Total est: <span className="text-blue-600 font-bold">{totalEstMinutes}</span> min
              </span>
            </div>
          </div>

          {/* 5. BOTTOM COMMAND TRIGGERS */}
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
              disabled={loading} 
              className="flex-1 h-8 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : null}
              <span>{isEditMode ? 'Save changes' : 'Create task'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTaskModal;
