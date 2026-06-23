import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Trash2, Clock, Loader2, Plus, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { useAuthStore } from '../store/authStore';
import { logger } from '../lib/logger';
import { SearchableFilterSelect } from './ui/SearchableFilterSelect';
import { DateRangePicker } from './ui/DateRangePicker';
import { useAppStore } from '../types';

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
  est_time: number;
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
  project_name: string;
  team_name: string;
  tag_name: string;
  note: string;
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
  subtasks?: any[];
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

// Helper representation of parsing functions

const normalizeDaysOfWeek = (dayStrOrArray: any): string[] => {
  if (!dayStrOrArray) return [];
  let rawArray: any[] = [];
  if (Array.isArray(dayStrOrArray)) {
    rawArray = dayStrOrArray;
  } else {
    const cleanStr = String(dayStrOrArray)
      .replace(/[\{\}\[\]"']/g, '')
      .trim();
    rawArray = cleanStr.split(/[\s,/~]+/).map(d => d.trim()).filter(Boolean);
  }
    
  const map: Record<string, string> = {
    'mo': 'Mon', 'mon': 'Mon', 'monday': 'Mon',
    'tu': 'Tue', 'tue': 'Tue', 'tuesday': 'Tue',
    'we': 'Wed', 'wed': 'Wed', 'wednesday': 'Wed',
    'th': 'Thu', 'thu': 'Thu', 'thursday': 'Thu',
    'fr': 'Fri', 'fri': 'Fri', 'friday': 'Fri',
    'sa': 'Sat', 'sat': 'Sat', 'saturday': 'Sat',
    'su': 'Sun', 'sun': 'Sun', 'sunday': 'Sun'
  };
  
  const results: string[] = [];
  rawArray.forEach(d => {
    const clean = String(d).toLowerCase().trim();
    if (map[clean]) {
      results.push(map[clean]);
    }
  });
  return results;
};

const parseOnetimeDates = (daysInput: any): { start: string; end: string; datesList: string[] } => {
  let dates: string[] = [];
  if (Array.isArray(daysInput)) {
    dates = daysInput.map(d => String(d).trim()).filter(Boolean);
  } else {
    const trimmed = String(daysInput || '').trim();
    if (trimmed.includes('~')) {
      const parts = trimmed.split('~').map(d => d.trim()).filter(Boolean);
      dates = parts;
    } else if (trimmed.includes(',')) {
      dates = trimmed.split(',').map(d => d.trim()).filter(Boolean);
    } else if (trimmed) {
      dates = [trimmed];
    }
  }

  const cleanDates = dates.map(d => d.replace(/\//g, '-')).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));

  if (cleanDates.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    return { start: today, end: today, datesList: [today] };
  }

  cleanDates.sort();
  const start = cleanDates[0];
  const end = cleanDates[cleanDates.length - 1];

  const datesList = [];
  try {
    let curr = new Date(start);
    const last = new Date(end);
    while (curr <= last) {
      datesList.push(curr.toISOString().slice(0, 10));
      curr.setDate(curr.getDate() + 1);
    }
  } catch (err) {
    console.error(err);
  }

  if (datesList.length === 0) {
    return { start, end, datesList: cleanDates };
  }

  return { start, end, datesList };
};

const parseTaskDescription = (rawDescription: any): TaskMetadata => {
  const defaultMeta: TaskMetadata = {
    project_name: '',
    team_name: '',
    tag_name: '',
    note: ''
  };

  if (!rawDescription) return defaultMeta;

  if (typeof rawDescription === 'object') {
    return {
      project_name: rawDescription.project_name || '',
      team_name: rawDescription.team_name || '',
      tag_name: rawDescription.tag_name || '',
      note: rawDescription.note || rawDescription.description || ''
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
          note: parsed.note || parsed.description || ''
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

const serializeTaskDescription = (metadata: TaskMetadata): any => {
  return metadata;
};

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ isOpen, onClose, onSuccess, taskToEdit, taskToClone }) => {
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [showScopeDialog, setShowScopeDialog] = useState(false);
  const [scopeDialogData, setScopeDialogData] = useState<{
    isRecurring: boolean;
    isScheduledToday: boolean;
    isOnetimeMultiDay: boolean;
    onetimeDaysCount: number;
    firstDate?: string;
    lastDate?: string;
  } | null>(null);
  const isEditMode = !!taskToEdit;

  const [masterData, setMasterData] = useState<{
    projects: { id: string; name: string }[];
    teams: { id: string; name: string }[];
    tags: { id: string; name: string }[];
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

  // State to track original values for change detection
  const [originalValues, setOriginalValues] = useState<{
    taskName: string;
    project: string;
    tag: string;
    team: string;
    taskType: string;
    note: string;
    deadlineTime24h: string;
    selectedDays: string[];
    monthlyDays: string;
    onetimeStartDate: string;
    onetimeEndDate: string;
    subTasks: any[];
  } | null>(null);

  // Fetch Master Data on open Including IDs for Relations
  useEffect(() => {
    if (isOpen) {
      const fetchMasterData = async () => {
        try {
          const [projRes, teamRes, tagRes, userRes] = await Promise.all([
            supabase.from('projects').select('id, name').eq('is_active', true).order('name', { ascending: true }),
            supabase.from('teams').select('id, name').eq('is_active', true).order('name', { ascending: true }),
            supabase.from('tags').select('id, name').eq('is_active', true).order('name', { ascending: true }),
            supabase.from('users').select('name').eq('status', 'ACTIVE').order('name', { ascending: true })
          ]);

          const projectsList = (projRes.data || []).map((p: any) => ({ id: p.id, name: p.name }));
          const teamsList = (teamRes.data || []).map((t: any) => ({ id: t.id, name: t.name }));
          const tagsList = (tagRes.data || []).map((t: any) => ({ id: t.id, name: t.name }));
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
        
        // Prefer direct RDBMS relation properties, fallback to old JSON meta
        const projName = (taskToEdit as any).projects?.name || meta.project_name || '';
        const tagName = (taskToEdit as any).tags?.name || meta.tag_name || '';
        const teamName = (taskToEdit as any).teams?.name || meta.team_name || '';
        const dbNote = taskToEdit.description && !taskToEdit.description.startsWith('{') ? taskToEdit.description : (meta.note || '');

        setTaskName(taskToEdit.title || (taskToEdit as any).task_name || '');
        setProject(projName);
        setTag(tagName);
        setTeam(teamName);
        setTaskType(taskToEdit.task_type || (taskToEdit as any).type || '');
        setNote(dbNote);

        // Parse structures matching exact time elements
        const currentDeadlineTime = (taskToEdit as any).deadline_time || '';
        if (currentDeadlineTime) {
          setDeadlineTime24h(convertTo24h(currentDeadlineTime));
        } else {
          setDeadlineTime24h('');
        }

        const daysInput = (taskToEdit as any).deadline_days;
        const daysStr = Array.isArray(daysInput) ? daysInput.join(', ') : (daysInput || '');
        if (taskToEdit.task_type === 'DAILY') {
          // Defaults
        } else if (taskToEdit.task_type === 'WEEKLY') {
          const parsed = normalizeDaysOfWeek(daysInput);
          setSelectedDays(parsed);
        } else if (taskToEdit.task_type === 'MONTHLY') {
          setMonthlyDays(daysStr);
        } else if (taskToEdit.task_type === 'ONETIME') {
          setOneTimeDate(daysStr);
          const { start, end, datesList } = parseOnetimeDates(daysInput);
          setOnetimeStartDate(start);
          setOnetimeEndDate(end);
          setOnetimeTargets(datesList.map(dt => ({
            id: Math.random().toString(36).substring(2, 9),
            date: dt,
            time: convertTo24h(currentDeadlineTime || '17:00')
          })));
        }

        const initialSubTasks = (taskToEdit.subtasks && taskToEdit.subtasks.length > 0)
          ? taskToEdit.subtasks.map((st: any) => ({
              id: st.id || st.subtask_id || Math.random().toString(36).substring(2, 9),
              content: st.content,
              assignee: st.assignee,
              est_time: st.est_time || st.estimated_minutes || 0
            }))
          : [];
        setSubTasks(initialSubTasks);

        setOriginalValues({
          taskName: taskToEdit.title || (taskToEdit as any).task_name || '',
          project: projName,
          tag: tagName,
          team: teamName,
          taskType: taskToEdit.task_type || (taskToEdit as any).type || '',
          note: dbNote,
          deadlineTime24h: currentDeadlineTime ? convertTo24h(currentDeadlineTime) : '',
          selectedDays: taskToEdit.task_type === 'WEEKLY' ? normalizeDaysOfWeek(daysInput) : [],
          monthlyDays: taskToEdit.task_type === 'MONTHLY' ? daysStr : '',
          onetimeStartDate: taskToEdit.task_type === 'ONETIME' ? parseOnetimeDates(daysInput).start : '',
          onetimeEndDate: taskToEdit.task_type === 'ONETIME' ? parseOnetimeDates(daysInput).end : '',
          subTasks: initialSubTasks
        });
      } else if (taskToClone) {
        const meta = parseTaskDescription(taskToClone.description);
        
        // Prefer direct RDBMS relation properties, fallback to old JSON meta
        const projName = (taskToClone as any).projects?.name || meta.project_name || '';
        const tagName = (taskToClone as any).tags?.name || meta.tag_name || '';
        const teamName = (taskToClone as any).teams?.name || meta.team_name || '';
        const dbNote = taskToClone.description && !taskToClone.description.startsWith('{') ? taskToClone.description : (meta.note || '');

        setTaskName(taskToClone.title || (taskToClone as any).task_name || '');
        setProject(projName);
        setTag(tagName);
        setTeam(teamName);
        setTaskType(taskToClone.task_type || (taskToClone as any).type || '');
        setNote(dbNote);

        const currentDeadlineTime = (taskToClone as any).deadline_time || '';
        if (currentDeadlineTime) {
          setDeadlineTime24h(convertTo24h(currentDeadlineTime));
        } else {
          setDeadlineTime24h('');
        }

        const daysInput = (taskToClone as any).deadline_days;
        const daysStr = Array.isArray(daysInput) ? daysInput.join(', ') : (daysInput || '');
        if (taskToClone.task_type === 'DAILY') {
          // Defaults
        } else if (taskToClone.task_type === 'WEEKLY') {
          const parsed = normalizeDaysOfWeek(daysInput);
          setSelectedDays(parsed);
        } else if (taskToClone.task_type === 'MONTHLY') {
          setMonthlyDays(daysStr);
        } else if (taskToClone.task_type === 'ONETIME') {
          setOneTimeDate(daysStr);
          const { start, end, datesList } = parseOnetimeDates(daysInput);
          setOnetimeStartDate(start);
          setOnetimeEndDate(end);
          setOnetimeTargets(datesList.map(dt => ({
            id: Math.random().toString(36).substring(2, 9),
            date: dt,
            time: convertTo24h(currentDeadlineTime || '17:00')
          })));
        }

        // Generate brand new client IDs for sub_tasks to prevent overlap key rendering references
        const initialClonedSubTasks = (taskToClone.subtasks && taskToClone.subtasks.length > 0)
          ? taskToClone.subtasks.map((st: any) => ({
              id: Math.random().toString(36).substring(2, 9),
              content: st.content,
              assignee: st.assignee,
              est_time: st.est_time || st.estimated_minutes || 0
            }))
          : [];
        setSubTasks(initialClonedSubTasks);

        setOriginalValues({
          taskName: taskToClone.title || (taskToClone as any).task_name || '',
          project: projName,
          tag: tagName,
          team: teamName,
          taskType: taskToClone.task_type || (taskToClone as any).type || '',
          note: dbNote,
          deadlineTime24h: currentDeadlineTime ? convertTo24h(currentDeadlineTime) : '',
          selectedDays: taskToClone.task_type === 'WEEKLY' ? normalizeDaysOfWeek(daysInput) : [],
          monthlyDays: taskToClone.task_type === 'MONTHLY' ? daysStr : '',
          onetimeStartDate: taskToClone.task_type === 'ONETIME' ? parseOnetimeDates(daysInput).start : '',
          onetimeEndDate: taskToClone.task_type === 'ONETIME' ? parseOnetimeDates(daysInput).end : '',
          subTasks: initialClonedSubTasks
        });
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
          est_time: 60
        }]);
        setOriginalValues(null);
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
      est_time: 60
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
    return subTasks.reduce((sum, s) => sum + (Number(s.est_time) || Number((s as any).estimated_minutes) || 0), 0);
  }, [subTasks]);

  const assigneeOptions = useMemo(() => {
    return masterData.assignees.map(name => ({ value: name, label: name }));
  }, [masterData.assignees]);

  const isUnchanged = useMemo(() => {
    if (!isEditMode || !originalValues) return false;

    if ((taskName || '').trim().toLowerCase() !== (originalValues.taskName || '').trim().toLowerCase()) return false;
    if (project !== originalValues.project) return false;
    if (team !== originalValues.team) return false;
    if (tag !== originalValues.tag) return false;
    if (taskType !== originalValues.taskType) return false;
    if ((note || '').trim().toLowerCase() !== (originalValues.note || '').trim().toLowerCase()) return false;
    if (deadlineTime24h !== originalValues.deadlineTime24h) return false;

    if (taskType === 'WEEKLY') {
      const isWeeklyEqual = selectedDays.length === originalValues.selectedDays.length &&
        selectedDays.every((d, i) => d === originalValues.selectedDays[i]);
      if (!isWeeklyEqual) return false;
    } else if (taskType === 'MONTHLY') {
      if ((monthlyDays || '').trim() !== (originalValues.monthlyDays || '').trim()) return false;
    } else if (taskType === 'ONETIME') {
      if (onetimeStartDate !== originalValues.onetimeStartDate || onetimeEndDate !== originalValues.onetimeEndDate) return false;
    }

    if (subTasks.length !== originalValues.subTasks.length) return false;
    const isSubtasksEqual = subTasks.every((st, idx) => {
      const orig = originalValues.subTasks[idx];
      if (!orig) return false;
      const stEst = Number(st.est_time || (st as any).estimated_minutes || 0);
      const origEst = Number(orig.est_time || orig.estimated_minutes || 0);
      return (st.content || '').trim().toLowerCase() === (orig.content || '').trim().toLowerCase() &&
             (st.assignee || '').trim() === (orig.assignee || '').trim() &&
             stEst === origEst;
    });
    if (!isSubtasksEqual) return false;

    return true;
  }, [
    isEditMode,
    originalValues,
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

  const executeSave = async (scope: 'FUTURE' | 'TODAY_ONLY') => {
    setLoading(true);
    try {
      // Find UUID relations from Master Data safely
      const selectedProjectObj = masterData.projects.find(p => p.name === project || p.id === project);
      const selectedTeamObj = masterData.teams.find(t => t.name === team || t.id === team);
      const selectedTagObj = masterData.tags.find(t => t.name === tag || t.id === tag);

      // Compute the deadline days string context for DB and logging
      const sortedTargets = [...onetimeTargets].sort((a, b) => a.date.localeCompare(b.date));
      let computedDeadlineDays = 'Mon - Fri';
      let deadlineDaysArray: string[] = [];

      if (taskType === 'DAILY') {
        computedDeadlineDays = 'Mon - Fri';
        deadlineDaysArray = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      } else if (taskType === 'WEEKLY') {
        computedDeadlineDays = selectedDays.join(', ');
        deadlineDaysArray = selectedDays;
      } else if (taskType === 'MONTHLY') {
        computedDeadlineDays = monthlyDays || '10, 20';
        deadlineDaysArray = monthlyDays.split(/[\s,]+/).map(d => d.trim()).filter(Boolean);
      } else if (taskType === 'ONETIME') {
        const firstDate = sortedTargets[0]?.date || '';
        const lastDate = sortedTargets[sortedTargets.length - 1]?.date || '';
        computedDeadlineDays = firstDate === lastDate ? firstDate : `${firstDate} ~ ${lastDate}`;
        deadlineDaysArray = sortedTargets.map(t => t.date);
      }

      const formattedDeadlineTime = convertToDisplayTime(taskType === 'ONETIME' ? (sortedTargets[0]?.time || '17:00') : deadlineTime24h);

      const todayStr = getTodayDateString();
      const yesterdayStr = getYesterdayDateString(todayStr);

      const oldMeta: any = isEditMode && taskToEdit ? parseTaskDescription(taskToEdit.description) : null;
      let updatedVersions = oldMeta?.versions || [];

      const updaterName = profile?.name || profile?.email || 'System';

      if (isEditMode && taskToEdit && oldMeta && taskType !== 'ONETIME' && scope === 'FUTURE') {
        const current_valid_from = oldMeta.last_updated_at
          ? oldMeta.last_updated_at.split('T')[0]
          : (taskToEdit.created_at ? taskToEdit.created_at.split('T')[0] : todayStr);

        const oldVersion: TaskVersion = {
          valid_from: current_valid_from,
          valid_until: todayStr,
          title: taskToEdit.title || (taskToEdit as any).task_name || '',
          description: oldMeta.note || '',
          project_name: oldMeta.project_name || taskToEdit.project_name || '',
          team_name: oldMeta.team_name || '',
          tag_name: oldMeta.tag_name || taskToEdit.tag_name || '',
          deadline_time: oldMeta.deadline_time || taskToEdit.deadline_time,
          deadline_days: oldMeta.deadline_days || taskToEdit.deadline_days,
          est_time: taskToEdit.est_time || taskToEdit.estimated_minutes || 0,
          sub_tasks: (taskToEdit.subtasks || []).map((st: any) => ({
            id: st.id,
            content: st.content,
            assignee: st.assignee,
            est_time: st.est_time || st.estimated_minutes || 0
          }))
        };
        updatedVersions = [...updatedVersions, oldVersion];
      }

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

      // Serialization description holding clean note AND versions if we have historical versions
      const descriptionValue = JSON.stringify({
        project_name: project,
        team_name: team,
        tag_name: tag,
        note: note.trim(),
        versions: updatedVersions,
        last_updated_at: new Date().toISOString(),
        last_updated_by: updaterName
      });

      // Construct compliant RDBMS payload with matching properties for schema compatibility
      const payload = {
        title: taskName.trim(),
        note: note.trim(), // renamed from description
        task_type: taskType,
        est_time: totalEstMinutes,
        status: hasUnfinishedTarget ? 'ON' : 'OFF',
        is_active: !!hasUnfinishedTarget,
        project_name: project || '',
        tag_name: tag || '',
        deadline_time: deadlineTime24h ? (deadlineTime24h.includes(':') && deadlineTime24h.split(':').length === 2 ? `${deadlineTime24h}:00` : deadlineTime24h) : null,
        deadline_days: deadlineDaysArray,
        history: updatedVersions
      };

      if (isEditMode && taskToEdit && taskType !== 'ONETIME' && scope === 'TODAY_ONLY') {
        // --- 1. ONLY UPDATE TODAY'S LOGS (Chỉ áp dụng duy nhất cho ngày hôm nay) ---
        // Fetch existing task log for today to check status/or other things.
        const { data: existingLog, error: fetchLogErr } = await supabase
          .from('task_logs')
          .select('*')
          .eq('task_id', taskToEdit.id)
          .eq('todo_date', todayStr)
          .maybeSingle();

        if (fetchLogErr) throw fetchLogErr;

        const taskLogStatus = existingLog ? (existingLog.status || 'NEW') : 'NEW';

        const taskLogPayload = {
          task_id: taskToEdit.id,
          todo_date: todayStr,
          status: taskLogStatus,
          title: taskName.trim(),
          project_name: project || '',
          tag_name: tag || '',
          deadline_time: deadlineTime24h ? (deadlineTime24h.includes(':') && deadlineTime24h.split(':').length === 2 ? `${deadlineTime24h}:00` : deadlineTime24h) : null,
          deadline_days: deadlineDaysArray,
          task_type: taskType,
          est_time: totalEstMinutes,
          updated_by: updaterName,
          actual_time: existingLog ? (existingLog.actual_time !== undefined && existingLog.actual_time !== null ? existingLog.actual_time : 0) : 0
        };

        // Upsert the task log
        const { error: logUpsertErr } = await supabase
          .from('task_logs')
          .upsert(taskLogPayload, { onConflict: 'task_id, todo_date' });

        if (logUpsertErr) throw logUpsertErr;

        // Fetch existing subtask logs for today to map completion state
        const { data: dbSubtaskLogs, error: subLogsFetchErr } = await supabase
          .from('subtask_logs')
          .select('*')
          .eq('task_id', taskToEdit.id)
          .eq('todo_date', todayStr);

        if (subLogsFetchErr) throw subLogsFetchErr;

        // Delete old subtask logs for today
        const { error: subLogsDeleteErr } = await supabase
          .from('subtask_logs')
          .delete()
          .eq('task_id', taskToEdit.id)
          .eq('todo_date', todayStr);

        if (subLogsDeleteErr) throw subLogsDeleteErr;

        // Build and insert new subtask logs
        const subtaskLogsToInsert = subTasks.map((st: any) => {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(st.id);
          const subtaskId = isUuid ? st.id : null;

          // Try to match with existing log
          const matchedLog = dbSubtaskLogs?.find((l: any) => 
            (subtaskId && l.subtask_id === subtaskId) || l.content === st.content
          );

          return {
            task_id: taskToEdit.id,
            subtask_id: subtaskId,
            todo_date: todayStr,
            content: st.content,
            assignee: st.content && st.assignee ? st.assignee : '',
            est_time: st.est_time || st.estimated_minutes || 0,
            team_name: team || '',
            is_completed: matchedLog ? matchedLog.is_completed : false,
            status: matchedLog ? (matchedLog.status || 'NEW') : 'NEW',
            completed_by: matchedLog ? matchedLog.completed_by : null,
            actual_time: matchedLog ? (matchedLog.actual_time !== undefined && matchedLog.actual_time !== null ? matchedLog.actual_time : 0) : 0
          };
        });

        if (subtaskLogsToInsert.length > 0) {
          const { error: subLogsInsertErr } = await supabase
            .from('subtask_logs')
            .insert(subtaskLogsToInsert);

          if (subLogsInsertErr) throw subLogsInsertErr;
        }

        const displayId = taskToEdit.display_id ? String(taskToEdit.display_id).padStart(6, '0') : '';
        const idSuffix = displayId ? ` [${displayId}]` : '';
        await logger.log('UPDATE_TASK_LOG_TODAY', `Updated task and subtasks logs for today only${idSuffix}: ${taskName.trim()}`, { taskId: taskToEdit.id, payload: taskLogPayload });

        // Trigger silent update of checklist stores to reload dynamically today's task
        const appState = useAppStore.getState();
        if (appState.startDate) {
          await appState.fetchDailyTasks(appState.startDate, appState.endDate || undefined, true);
        }

      } else if (isEditMode && taskToEdit) {
        // --- 2. STANDARD FUTURE TEMPLATE UPDATE ---
        // A. Cập nhật task bản mẫu trong bảng tasks
        const { error: taskError } = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', taskToEdit.id);

        if (taskError) throw taskError;

        // B. Đồng bộ hóa Subtask quan hệ trong bảng subtasks
        // 1. Quét danh sách các subtask hiện có trong DB của bản mẫu task_id này
        const { data: dbSubtasks, error: fetchSubError } = await supabase
          .from('subtasks')
          .select('id')
          .eq('task_id', taskToEdit.id);

        if (fetchSubError) throw fetchSubError;

        const dbSubs = dbSubtasks || [];

        // 2. Phân loại subtask từ Form thành Update (Cũ) và Insert (Mới)
        const subTasksToUpdate: any[] = [];
        const subTasksToInsert: any[] = [];

        subTasks.forEach((st: any) => {
          const matchedDbSub = dbSubs.find(
            (dbSub: any) => dbSub.id === st.id
          );

          if (matchedDbSub) {
            subTasksToUpdate.push({
              id: matchedDbSub.id,
              task_id: taskToEdit.id,
              content: st.content,
              assignee: st.assignee,
              est_time: st.est_time || st.estimated_minutes || 0,
              status: 'PENDING',
              team_name: team || ''
            });
          } else {
            subTasksToInsert.push({
              task_id: taskToEdit.id,
              content: st.content,
              assignee: st.assignee,
              est_time: st.est_time || st.estimated_minutes || 0,
              status: 'PENDING',
              team_name: team || ''
            });
          }
        });

        // 3. Tìm các subtasks đã bị Admin bấm xóa trên UI
        const subTasksToDelete = dbSubs.filter((dbSub: any) => {
          return !subTasks.some(
            (st: any) => st.id === dbSub.id
          );
        });

        // 4. Thực thi các tác vụ xóa, cập nhật, và thêm mới subtasks
        // Delete
        if (subTasksToDelete.length > 0) {
          const deleteIds = subTasksToDelete.map((d: any) => d.id);
          const { error: deleteErr } = await supabase
            .from('subtasks')
            .delete()
            .in('id', deleteIds);
          if (deleteErr) throw deleteErr;
        }

        // Update
        if (subTasksToUpdate.length > 0) {
          const updatePromises = subTasksToUpdate.map((sub: any) => {
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

        // Insert
        if (subTasksToInsert.length > 0) {
          const { error: insertErr } = await supabase
            .from('subtasks')
            .insert(subTasksToInsert);
          if (insertErr) throw insertErr;
        }

        const displayId = taskToEdit.display_id ? String(taskToEdit.display_id).padStart(6, '0') : '';
        const idSuffix = displayId ? ` [${displayId}]` : '';
        await logger.log('UPDATE_TASK_TEMPLATE', `Updated task template${idSuffix}: ${taskName.trim()}`, { taskId: taskToEdit.id, payload });
      } else {
        // A. Tạo mới Task bản mẫu
        const { data, error: taskError } = await supabase
          .from('tasks')
          .insert([payload])
          .select('id, display_id')
          .single();

        if (taskError) throw taskError;
        if (!data) throw new Error('Failed to create task template record.');

        const taskId = data.id;

        // B. Lưu hàng loạt Subtasks bản mẫu cho Task mới
        const subtasksToInsert = subTasks.map((st: any) => ({
          task_id: taskId,
          content: st.content,
          assignee: st.assignee,
          est_time: st.est_time || st.estimated_minutes || 0,
          status: 'PENDING',
          team_name: team || ''
        }));

        if (subtasksToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('subtasks')
            .insert(subtasksToInsert);
          if (insertError) throw insertError;
        }

        const displayId = data.display_id ? String(data.display_id).padStart(6, '0') : '';
        const idSuffix = displayId ? ` [${displayId}]` : '';
        await logger.log('CREATE_TASK_TEMPLATE', `Created task template${idSuffix}: ${taskName.trim()}`, { taskId, payload });
      }

      await useAppStore.getState().fetchTasks(true);
      toast.success(isEditMode ? 'Cập nhật bản mẫu thành công!' : 'Tạo bản mẫu thành công!');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving task template:', err);
      toast.error(`Error context: ${err.message || 'Unknown database issue'}`);
    } finally {
      setLoading(false);
    }
  };

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
      const estVal = sub.est_time !== undefined ? sub.est_time : (sub as any).estimated_minutes;
      if (estVal !== undefined && estVal < 0) {
        toast.warning('Estimated time for the sub-task cannot be negative.');
        return;
      }
    }

    if (isEditMode && taskToEdit) {
      const isRecurring = taskType !== 'ONETIME';
      const isOnetimeMultiDay = taskType === 'ONETIME' && onetimeTargets.length > 1;

      // Determine isScheduledToday
      let isScheduledToday = false;
      const today = new Date();
      const todayStr = getTodayDateString();
      const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const todayDayName = daysMap[today.getDay()];
      const todayDateNum = today.getDate();

      if (taskType === 'DAILY') {
        isScheduledToday = today.getDay() >= 1 && today.getDay() <= 5;
      } else if (taskType === 'WEEKLY') {
        isScheduledToday = selectedDays.includes(todayDayName);
      } else if (taskType === 'MONTHLY') {
        const parts = monthlyDays.split(/[\s,]+/).map(p => p.trim()).filter(Boolean);
        isScheduledToday = parts.some(p => parseInt(p, 10) === todayDateNum);
      } else if (taskType === 'FLEXIBLE') {
        isScheduledToday = true;
      } else if (taskType === 'ONETIME') {
        isScheduledToday = onetimeTargets.some(t => t.date === todayStr);
      }

      if (isRecurring) {
        setScopeDialogData({
          isRecurring: true,
          isScheduledToday,
          isOnetimeMultiDay: false,
          onetimeDaysCount: 0
        });
        setShowScopeDialog(true);
        return;
      } else if (isOnetimeMultiDay) {
        const sorted = [...onetimeTargets].sort((a, b) => a.date.localeCompare(b.date));
        setScopeDialogData({
          isRecurring: false,
          isScheduledToday,
          isOnetimeMultiDay: true,
          onetimeDaysCount: onetimeTargets.length,
          firstDate: sorted[0]?.date,
          lastDate: sorted[sorted.length - 1]?.date
        });
        setShowScopeDialog(true);
        return;
      }
    }

    // Default to 'FUTURE' edit scope for simple saves
    await executeSave('FUTURE');
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
                  <option key={proj.id} value={proj.name}>{proj.name}</option>
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
                  <option key={tg.id} value={tg.name}>{tg.name}</option>
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
              disabled={loading || (isEditMode && isUnchanged)} 
              className="flex-1 h-8 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              title={isEditMode && isUnchanged ? "No changes to save" : ""}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : null}
              <span>{isEditMode ? 'Save changes' : 'Create task'}</span>
            </button>
          </div>
        </form>
      </div>

      {showScopeDialog && scopeDialogData && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-100 p-6 space-y-4 animate-in zoom-in-95 duration-150 text-left">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <span>Lựa chọn phạm vi áp dụng chỉnh sửa</span>
            </h4>
            
            <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
              {scopeDialogData.isRecurring ? (
                <>
                  <p>
                    Bạn đang chỉnh sửa một <strong>Task định kỳ / lặp lại</strong> ({taskType}).
                  </p>
                  {scopeDialogData.isScheduledToday ? (
                    <div className="p-2.5 bg-green-50 border border-green-100 text-green-800 rounded-lg">
                      Hôm nay ({getTodayDateString()}) là ngày xuất hiện của task này. Do đó, bạn có thể chọn chỉ áp dụng thay đổi cho hôm nay hoặc cho toàn bộ tương lai.
                    </div>
                  ) : (
                    <div className="p-2.5 bg-amber-50 border border-amber-100 text-amber-800 rounded-lg">
                      Hôm nay ({getTodayDateString()}) <strong>không nằm trong lịch xuất hiện gốc</strong> của task này. Bạn chỉ nên lựa chọn áp dụng từ nay về sau (không thể chọn "Chỉ hôm nay" do không có instance hiển thị).
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p>
                    Bạn đang chỉnh sửa một <strong>Task dài ngày</strong> kéo dài {scopeDialogData.onetimeDaysCount} ngày (từ {scopeDialogData.firstDate} đến {scopeDialogData.lastDate}).
                  </p>
                  {scopeDialogData.isScheduledToday ? (
                    <div className="p-2.5 bg-green-50 border border-green-100 text-green-800 rounded-lg">
                      Hôm nay ({getTodayDateString()}) nằm trong khoảng thời gian diễn ra của task này. Do đó, bạn có thể chọn chỉ áp dụng thay đổi cho hôm nay hoặc cho toàn bộ tương lai.
                    </div>
                  ) : (
                    <div className="p-2.5 bg-amber-50 border border-amber-100 text-amber-800 rounded-lg">
                      Hôm nay ({getTodayDateString()}) <strong>không nằm trong khoảng thời gian diễn ra</strong> của task này ({scopeDialogData.firstDate} ~ {scopeDialogData.lastDate}). Bạn chỉ nên áp dụng từ nay về sau (không thể chọn "Chỉ hôm nay" do không có instance hiển thị).
                    </div>
                  )}
                </>
              )}
            </div>

            <p className="text-[11px] text-slate-400 font-medium">
              Vui lòng chọn phạm vi áp dụng chỉnh sửa:
            </p>

            <div className="flex flex-col gap-2 pt-1.5">
              <button
                type="button"
                onClick={async () => {
                  setShowScopeDialog(false);
                  await executeSave('FUTURE');
                }}
                className="w-full h-8 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer"
              >
                Áp dụng từ hôm nay trở đi (Today & Future)
              </button>

              <button
                type="button"
                disabled={!scopeDialogData.isScheduledToday}
                onClick={async () => {
                  setShowScopeDialog(false);
                  await executeSave('TODAY_ONLY');
                }}
                className={`w-full h-8 px-4 text-xs font-semibold rounded-lg transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer border ${
                  scopeDialogData.isScheduledToday
                    ? 'text-slate-700 bg-white hover:bg-slate-50 border-slate-200'
                    : 'text-slate-300 bg-slate-50 border-slate-100 cursor-not-allowed'
                }`}
                title={!scopeDialogData.isScheduledToday ? "Hôm nay không phải ngày diễn ra task này" : undefined}
              >
                Chỉ áp dụng duy nhất hôm nay (Today Only)
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowScopeDialog(false);
                  setLoading(false);
                }}
                className="w-full h-8 px-4 text-xs font-medium text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-all text-center cursor-pointer"
              >
                Hủy bỏ (Cancel)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateTaskModal;
