import React, { useState, useMemo, useEffect } from 'react';
import { 
  ClipboardList, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  FastForward,
  RotateCw,
  RotateCcw
} from 'lucide-react';
import { DateRangePicker } from './ui/DateRangePicker';
import { FilterSelect } from './ui/FilterSelect';
import { SearchableFilterSelect } from './ui/SearchableFilterSelect';
import { MultiTeamFilterSelect } from './ui/MultiTeamFilterSelect';
import { useDashboardData } from '../hooks/useDashboardData';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../types';
import { getTaskTeams as getTaskTeamsShared } from '../lib/utils';

// Interface definitions aligned with Single Table design
interface SubTask {
  id: string;
  name: string;
  assignee?: string;
  estimated_minutes?: number;
  actual_minutes?: number;
  sub_status?: 'New' | 'Done' | 'Skipped';
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
  todo_status?: 'NEW' | 'DONE' | 'SKIPPED';
  todo_date?: string;
  completions?: Record<string, { todo_status: 'NEW' | 'DONE' | 'SKIPPED', actual_time: number, sub_tasks?: SubTask[] }>;
  note?: string;
  versions?: TaskVersion[];
  onetime_targets?: any[];
}

const parseDescriptionMeta = (descriptionStr: any): TaskMetadata => {
  const defaultMeta: TaskMetadata = {
    description: '',
    project_name: '【事務代行】HR TECH',
    team_name: '内部・1課',
    tag_name: '数値報告',
    deadline_time: '17:00',
    deadline_days: 'Mon - Fri',
    sub_tasks: [],
    note: '',
    versions: [],
    onetime_targets: []
  };

  if (!descriptionStr) return defaultMeta;

  if (typeof descriptionStr === 'object') {
    return {
      description: descriptionStr.description || '',
      project_name: descriptionStr.project_name || '【事務代行】HR TECH',
      team_name: descriptionStr.team_name || '内部・1課',
      tag_name: descriptionStr.tag_name || '数値報告',
      deadline_time: descriptionStr.deadline_time || '17:00',
      deadline_days: descriptionStr.deadline_days || 'Mon - Fri',
      sub_tasks: Array.isArray(descriptionStr.sub_tasks) ? descriptionStr.sub_tasks : [],
      todo_status: descriptionStr.todo_status,
      todo_date: descriptionStr.todo_date,
      completions: descriptionStr.completions,
      note: descriptionStr.note || '' ,
      versions: descriptionStr.versions || [],
      onetime_targets: Array.isArray(descriptionStr.onetime_targets) ? descriptionStr.onetime_targets : []
    };
  }

  if (typeof descriptionStr === 'string') {
    const trimmed = descriptionStr.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return {
          description: parsed.description || '',
          project_name: parsed.project_name || '【事務代行】HR TECH',
          team_name: parsed.team_name || '内部・1課',
          tag_name: parsed.tag_name || '数値報告',
          deadline_time: parsed.deadline_time || '17:00',
          deadline_days: parsed.deadline_days || 'Mon - Fri',
          sub_tasks: Array.isArray(parsed.sub_tasks) ? parsed.sub_tasks : [],
          todo_status: parsed.todo_status,
          todo_date: parsed.todo_date,
          completions: parsed.completions,
          note: parsed.note || '',
          versions: parsed.versions || [],
          onetime_targets: Array.isArray(parsed.onetime_targets) ? parsed.onetime_targets : []
        };
      } catch {
        // ignore JSON error
      }
    }
  }

  return {
    ...defaultMeta,
    description: String(descriptionStr)
  };
};

const getTaskVersionForDate = (meta: any, date: string): TaskVersion | null => {
  const versions = meta?.versions || [];
  for (const v of versions) {
    const from = v.valid_from;
    const until = v.valid_until;
    if (date >= from && (!until || date <= until)) {
      return v;
    }
  }
  return null;
};

const getVirtualOccurrences = (
  task_type: string,
  deadline_days: string,
  createdAt: string,
  startDate: string,
  endDate: string,
  bypassCreatedAt: boolean = false
): Array<{ todo_date: string; origin_repeat_day?: number; completion_key: string }> => {
  const type = (task_type || '').toUpperCase();
  const cleanDays = (deadline_days || '').trim();

  const occurrences: Array<{ todo_date: string; origin_repeat_day?: number; completion_key: string }> = [];

  const parseDateStringUTC = (str: string): Date => {
    const parts = str.split('-');
    return new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
  };

  const formatDateUTC = (d: Date): string => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const startD = parseDateStringUTC(startDate);
  const endD = parseDateStringUTC(endDate);

  if (type === 'ONETIME') {
    const datesParsed: string[] = [];
    if (cleanDays.includes('~')) {
      const parts = cleanDays.split('~').map(s => s.trim());
      const startStr = parts[0];
      const endStr = parts[1];
      if (/^\d{4}-\d{2}-\d{2}$/.test(startStr) && /^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
        let curr = parseDateStringUTC(startStr);
        const last = parseDateStringUTC(endStr);
        while (curr <= last) {
          datesParsed.push(formatDateUTC(curr));
          curr.setUTCDate(curr.getUTCDate() + 1);
        }
      }
    } else if (cleanDays.includes(',')) {
      cleanDays.split(',').forEach(s => {
        const dStr = s.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
          datesParsed.push(dStr);
        }
      });
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDays)) {
      datesParsed.push(cleanDays);
    }

    datesParsed.forEach(dateStr => {
      if (dateStr >= startDate && dateStr <= endDate) {
        occurrences.push({
          todo_date: dateStr,
          completion_key: dateStr
        });
      }
    });

    return occurrences;
  }

  const createdAtDate = createdAt ? createdAt.split('T')[0] : '';

  if (type === 'DAILY' || type === 'WEEKLY') {
    let curr = new Date(startD);
    while (curr <= endD) {
      const dateStr = formatDateUTC(curr);
      if (bypassCreatedAt || !createdAtDate || dateStr >= createdAtDate) {
        const weekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const dayShort = weekdaysShort[curr.getUTCDay()];

        let isMatch = false;
        if (type === 'DAILY') {
          isMatch = dayShort !== 'Sun' && dayShort !== 'Sat';
        } else if (type === 'WEEKLY') {
          if (cleanDays === 'Mon - Fri' || cleanDays === 'Daily') {
            isMatch = dayShort !== 'Sun' && dayShort !== 'Sat';
          } else {
            const parts = cleanDays.split(/[\s,]+/).map(d => d.trim().toLowerCase());
            isMatch = parts.includes(dayShort.toLowerCase());
          }
        }

        if (isMatch) {
          occurrences.push({
            todo_date: dateStr,
            completion_key: dateStr
          });
        }
      }
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return occurrences;
  }

  if (type === 'MONTHLY') {
    const parts = cleanDays.split(/[\s,]+/).map(p => parseInt(p.trim())).filter(p => !isNaN(p));
    
    const expStart = new Date(startD);
    expStart.setUTCDate(expStart.getUTCDate() - 3);
    const expEnd = new Date(endD);
    expEnd.setUTCDate(expEnd.getUTCDate() + 3);

    let curr = new Date(expStart);
    while (curr <= expEnd) {
      const curYear = curr.getUTCFullYear();
      const curMonth = curr.getUTCMonth();
      const curDate = curr.getUTCDate();
      
      const lastDayOfMonth = new Date(Date.UTC(curYear, curMonth + 1, 0)).getUTCDate();
      
      const weekdaysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayShort = weekdaysShort[curr.getUTCDay()];

      const matchingR = parts.find(r => Math.min(r, lastDayOfMonth) === curDate);
      
      if (matchingR !== undefined) {
        let shiftD = new Date(curr);

        if (dayShort === 'Sat') {
          shiftD.setUTCDate(curr.getUTCDate() - 1);
        } else if (dayShort === 'Sun') {
          shiftD.setUTCDate(curr.getUTCDate() + 1);
        }

        const shiftedDateStr = formatDateUTC(shiftD);
        
        if (shiftedDateStr >= startDate && shiftedDateStr <= endDate) {
          if (bypassCreatedAt || !createdAtDate || shiftedDateStr >= createdAtDate) {
            occurrences.push({
              todo_date: shiftedDateStr,
              origin_repeat_day: matchingR,
              completion_key: `${shiftedDateStr}_r${matchingR}`
            });
          }
        }
      }
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    
    occurrences.sort((a, b) => {
      if (a.todo_date !== b.todo_date) {
        return a.todo_date.localeCompare(b.todo_date);
      }
      return (a.origin_repeat_day || 0) - (b.origin_repeat_day || 0);
    });
    
    return occurrences;
  }

  return occurrences;
};

const isTaskOnWeekday = (task_type: string, deadlineDays: string, dayShort: string, dateString: string, dayOfMonth: number, createdAt: string, todoDate?: string, bypassCreatedAt: boolean = false): boolean => {
  const type = (task_type || '').toUpperCase();
  const cleanDays = (deadlineDays || '').trim();

  // Condition: không hiển thị những ngày trước thời điểm tạo task (có thể bypass cho Roadmap)
  if (!bypassCreatedAt) {
    const createdAtDate = createdAt ? createdAt.split('T')[0] : '';
    if (createdAtDate && dateString < createdAtDate) {
      return false;
    }
  }

  if (type === 'DAILY') {
    return dayShort !== 'Sat' && dayShort !== 'Sun';
  }
  
  if (type === 'WEEKLY') {
    if (cleanDays === 'Mon - Fri' || cleanDays === 'Daily') {
      return true;
    }
    const parts = cleanDays.split(/[\s,]+/).map(d => d.trim().toLowerCase());
    return parts.includes(dayShort.toLowerCase());
  }

  if (type === 'MONTHLY') {
    const parts = cleanDays.split(/[\s,]+/).map(d => parseInt(d.trim())).filter(d => !isNaN(d));
    const dayShortLower = dayShort.toLowerCase();
    
    if (dayShortLower === 'sat' || dayShortLower === 'sun') {
      return false;
    }
    
    if (dayShortLower === 'mon') {
      const d = new Date(dateString);
      const yesterday = new Date(d);
      yesterday.setDate(d.getDate() - 1);
      const dayOfMonthYesterday = yesterday.getDate();
      return parts.includes(dayOfMonth) || parts.includes(dayOfMonthYesterday);
    }

    if (dayShortLower === 'fri') {
      const d = new Date(dateString);
      const tomorrow = new Date(d);
      tomorrow.setDate(d.getDate() + 1);
      const dayOfMonthTomorrow = tomorrow.getDate();
      return parts.includes(dayOfMonth) || parts.includes(dayOfMonthTomorrow);
    }
    
    return parts.includes(dayOfMonth);
  }

  if (type === 'ONETIME') {
    return cleanDays === dateString || todoDate === dateString;
  }

  return false;
};

const formatDuration = (minutes: number) => {
  if (!minutes || minutes <= 0) return '0h 00m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

const getLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDatesBetween = (startStr: string, endStr: string): string[] => {
  const dates: string[] = [];
  try {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const cursor = new Date(start);
    while (cursor <= end) {
      dates.push(getLocalDateString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  } catch (e) {
    console.error('Error calculating date range:', e);
  }
  return dates;
};

const getWeekDays = () => {
  const current = new Date();
  const dayOfWeek = current.getDay(); // 0 is Sunday, 1 is Monday...
  
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(current);
  monday.setDate(current.getDate() + diffToMonday);
  
  const weekdays = [];
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const mapShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekdays.push({
      name: names[i],
      short: mapShort[i],
      dateString: getLocalDateString(d),
      dayOfMonth: d.getDate(),
      isToday: d.toDateString() === current.toDateString(),
    });
  }
  return weekdays;
};

export default function Dashboard() {
  const { profile } = useAuthStore();
  const { usersFullList } = useAppStore();
  const {
    tasks,
    loading,
    error,
    projectsList,
    teamsList,
    tagsList,
    assigneesList,
    refetch
  } = useDashboardData();

  // Filter Personnel - Default is current logged in user name
  const [filterPersonnel, setFilterPersonnel] = useState<string>(() => {
    const stored = sessionStorage.getItem('db_filterPersonnel');
    return stored !== null ? stored : (useAuthStore.getState().profile?.name || '');
  });

  // Rest of dropdown parameters
  const [filterProject, setFilterProject] = useState<string>(() => sessionStorage.getItem('db_filterProject') || '');
  const [filterTag, setFilterTag] = useState<string>(() => sessionStorage.getItem('db_filterTag') || '');
  const [filterTeam, setFilterTeam] = useState<string>(() => sessionStorage.getItem('db_filterTeam') || '');
  const [filterTaskType, setFilterTaskType] = useState<string>(() => sessionStorage.getItem('db_filterTaskType') || '');

  const selectedTeams = useMemo(() => {
    return filterTeam ? filterTeam.split(',').filter(Boolean) : [];
  }, [filterTeam]);

  const selectedTaskTypes = useMemo(() => {
    return filterTaskType ? filterTaskType.split(',').filter(Boolean) : [];
  }, [filterTaskType]);

  // Date Range filter states - Default is TODAY's date
  const [startDate, setStartDate] = useState<string>(() => sessionStorage.getItem('db_startDate') || getLocalDateString(new Date()));
  const [endDate, setEndDate] = useState<string>(() => sessionStorage.getItem('db_endDate') || getLocalDateString(new Date()));

  useEffect(() => {
    sessionStorage.setItem('db_filterPersonnel', filterPersonnel);
  }, [filterPersonnel]);

  useEffect(() => {
    sessionStorage.setItem('db_filterProject', filterProject);
  }, [filterProject]);

  useEffect(() => {
    sessionStorage.setItem('db_filterTag', filterTag);
  }, [filterTag]);

  useEffect(() => {
    sessionStorage.setItem('db_filterTeam', filterTeam);
  }, [filterTeam]);

  useEffect(() => {
    sessionStorage.setItem('db_filterTaskType', filterTaskType);
  }, [filterTaskType]);

  useEffect(() => {
    sessionStorage.setItem('db_startDate', startDate);
  }, [startDate]);

  useEffect(() => {
    sessionStorage.setItem('db_endDate', endDate);
  }, [endDate]);

  // Active dates
  const weekDays = useMemo(() => getWeekDays(), []);

  // Map of usernames to their team names
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
  const getTaskTeams = React.useCallback((taskSubtasks: any[], fallbackTeamName: string = '') => {
    return getTaskTeamsShared(taskSubtasks, fallbackTeamName, userToTeamsMap);
  }, [userToTeamsMap]);

  // Compute robust dropdown filter personnel list
  const currentAssignees = useMemo(() => {
    const list = [...assigneesList];
    if (profile?.name && !list.includes(profile.name)) {
      list.push(profile.name);
    }
    const baseList = list.length > 0 ? list : ['PHAN QUANG DAT', 'LE QUANG VINH', 'LE QUANG VINH 2', 'VINH 1', 'VINH 2'];
    
    // Filter by selected team
    if (selectedTeams.length > 0) {
      return baseList.filter(person => {
        const teams = userToTeamsMap[person] || [];
        return teams.some(t => selectedTeams.includes(t));
      });
    }
    return baseList;
  }, [assigneesList, profile?.name, filterTeam, userToTeamsMap]);

  const currentProjects = useMemo(() => {
    return projectsList.length > 0 ? projectsList : ['【事務代行】HR TECH', 'GLOBAL OUTSOURCING', '求人媒体運用', 'RECRUITING MANAGEMENT', 'ADMIN OPERATIONS'];
  }, [projectsList]);

  const currentTags = useMemo(() => {
    return tagsList.length > 0 ? tagsList : ['求人更新', '数値報告', 'メールチェック', 'レポート作成', 'データ入力', 'システム保守'];
  }, [tagsList]);

  const currentTeams = useMemo(() => {
    return teamsList.length > 0 ? teamsList : ['内部・2課E', '内部・1課', 'アウトソーシングG', '人事総務部', '営業サポート課'];
  }, [teamsList]);

  // Solve 5 metrics state WITH filters AND Date filter (Default Today)
  const statsVirtualTasks = useMemo(() => {
    const list: any[] = [];

    tasks.forEach(task => {
      const meta = parseDescriptionMeta(task.description);
      // Backwards-compatible override using direct database properties
      meta.project_name = task.projects?.name || meta.project_name;
      meta.team_name = task.teams?.name || meta.team_name;
      meta.tag_name = task.tags?.name || meta.tag_name;
      meta.deadline_days = task.deadline_days || meta.deadline_days;
      meta.deadline_time = task.deadline_time ? task.deadline_time.slice(0, 5) : meta.deadline_time;
      if (task.subtasks && task.subtasks.length > 0) {
        const uniqueSubtasks = task.subtasks.filter((sub: any, index: number, self: any[]) =>
          self.findIndex((s: any) => s.id === sub.id) === index
        );
        meta.sub_tasks = uniqueSubtasks.map((st: any) => ({
          id: st.subtask_id || st.id,
          content: st.content,
          name: st.content,
          assignee: st.assignee,
          estimated_minutes: st.estimated_minutes
        }));
      }

      const isRecurring = ['DAILY', 'WEEKLY', 'MONTHLY', 'ONETIME'].includes((task.task_type || '').toUpperCase());

      // Correct meta based todo_status and date for OneTime
      const isOneTime = (task.task_type || '').toUpperCase() === 'ONETIME';
      const fallbackDate = isOneTime && meta.deadline_days && /^\d{4}-\d{2}-\d{2}$/.test(meta.deadline_days)
         ? meta.deadline_days 
         : new Date(task.created_at).toISOString().split('T')[0];

      const resolvedTask = {
        ...task,
        meta,
        project_name: meta.project_name,
        team_name: meta.team_name,
        tag_name: meta.tag_name,
        deadline_time: meta.deadline_time,
        deadline_days: meta.deadline_days,
        sub_tasks: meta.sub_tasks,
        todo_status: meta.todo_status || 'NEW',
        todo_date: meta.todo_date || fallbackDate
      };

      if (isRecurring) {
        const occurrences = getVirtualOccurrences(task.task_type || '', meta.deadline_days || '', task.created_at || '', startDate, endDate);
        occurrences.forEach(occ => {
          const completions = meta.completions || {};
          const completion = completions[occ.completion_key] || completions[occ.todo_date];
          const todo_status = completion?.todo_status || 'NEW';

          // RULE: If template is inactive (OFF), only keep historical done or skipped days!
          if (!task.is_active && todo_status !== 'DONE' && todo_status !== 'SKIPPED') {
            return;
          }

          // If status is NEW, bypass historical versions lookup to guarantee immediate template updates today!
          const isNewStatus = todo_status === 'NEW';
          const activeVersion = isNewStatus ? null : getTaskVersionForDate(meta, occ.todo_date);
          const project_name = activeVersion ? activeVersion.project_name : meta.project_name;
          const team_name = activeVersion ? activeVersion.team_name : meta.team_name;
          const tag_name = activeVersion ? activeVersion.tag_name : meta.tag_name;
          const deadline_days = activeVersion ? activeVersion.deadline_days : meta.deadline_days;
          const sub_tasks = activeVersion ? activeVersion.sub_tasks : meta.sub_tasks;

          // Filter check side dropdowns
          if (filterProject && project_name !== filterProject) return;
          if (filterTag && tag_name !== filterTag) return;
          if (selectedTeams.length > 0) {
            const { allTeams } = getTaskTeams(sub_tasks, team_name);
            const hasMatchingTeam = allTeams.some(t => selectedTeams.includes(t));
            if (!hasMatchingTeam) return;
          }
          if (selectedTaskTypes.length > 0 && !selectedTaskTypes.includes((task.task_type || '').toUpperCase())) return;

          // Filter check dynamic Assignee (Sub-tasks or Main assignees)
          if (filterPersonnel) {
            const hasInSubTask = sub_tasks && sub_tasks.some((s: any) => s.assignee === filterPersonnel);
            const hasInMain = Array.isArray((task as any).assignees) && (task as any).assignees.includes(filterPersonnel);
            if (!hasInSubTask && !hasInMain) return;
          }

          // Map sub-tasks dynamically: merge template subtasks with existing completion progress if NEW
          let subTasksResolved;
          if (isNewStatus) {
            const existingSubs = completion?.sub_tasks || [];
            subTasksResolved = sub_tasks.map((s: any) => {
              const existing = existingSubs.find((ext: any) => ext.id === s.id);
              return {
                ...s,
                sub_status: existing ? existing.sub_status : ('New' as const),
                actual_minutes: existing ? existing.actual_minutes : 0
              };
            });
          } else {
            subTasksResolved = completion?.sub_tasks || sub_tasks.map((s: any) => ({
              ...s,
              sub_status: 'New' as const,
              actual_minutes: 0
            }));
          }

          // Calculate task status under the new rules
          let resolvedStatus = 'NEW';
          if (filterPersonnel) {
            const userSubTasks = subTasksResolved.filter((s: any) => s.assignee === filterPersonnel);
            if (userSubTasks.length > 0) {
              if (todo_status === 'DONE') {
                const hasUserDone = userSubTasks.some((s: any) => s.sub_status === 'Done');
                if (hasUserDone) {
                  resolvedStatus = 'DONE';
                } else {
                  const allUserSkipped = userSubTasks.every((s: any) => s.sub_status === 'Skipped');
                  resolvedStatus = allUserSkipped ? 'SKIPPED' : 'NEW';
                }
              } else if (todo_status === 'SKIPPED') {
                resolvedStatus = 'SKIPPED';
              } else {
                resolvedStatus = 'NEW';
              }
            } else {
              resolvedStatus = todo_status;
            }
          } else {
            resolvedStatus = todo_status;
          }

          // Calc duration
          let actual_time = 0;
          let est_time = 0;

          if (filterPersonnel) {
            const userSubTasks = subTasksResolved.filter((s: any) => s.assignee === filterPersonnel);
            if (userSubTasks.length > 0) {
              actual_time = userSubTasks.reduce((sum, s: any) => sum + (s.sub_status === 'Done' ? (s.actual_minutes || 0) : 0), 0);
              est_time = userSubTasks.reduce((sum, s: any) => sum + (s.estimated_minutes || 0), 0);
            } else {
              const hasInMain = Array.isArray((task as any).assignees) && (task as any).assignees.includes(filterPersonnel);
              if (hasInMain) {
                actual_time = completion?.actual_time || 0;
                est_time = task.est_time || 0;
              }
            }
          } else {
            actual_time = completion?.actual_time || subTasksResolved.reduce((sum, s: any) => sum + (s.sub_status === 'Done' ? (s.actual_minutes || 0) : 0), 0) || 0;
            est_time = subTasksResolved.reduce((sum, s: any) => sum + (s.estimated_minutes || 0), 0) || task.est_time || 0;
          }

          const title = activeVersion ? activeVersion.title : task.title;

          list.push({
            ...task,
            title,
            todo_date: occ.todo_date,
            todo_status: resolvedStatus,
            est_time,
            actual_time,
            origin_repeat_day: occ.origin_repeat_day,
            completion_key: occ.completion_key
          });
        });
      } else {
        const targets = (resolvedTask.meta.onetime_targets && resolvedTask.meta.onetime_targets.length > 0)
          ? resolvedTask.meta.onetime_targets
          : [{
              id: '1',
              date: resolvedTask.todo_date,
              time: resolvedTask.deadline_time || '17:00',
              todo_status: resolvedTask.todo_status,
              sub_tasks: resolvedTask.sub_tasks || []
            }];

        targets.forEach((target: any) => {
          const todo_date = target.date;
          const todo_status = target.todo_status || 'NEW';

          // Filter check side dropdowns
          if (filterProject && meta.project_name !== filterProject) return;
          if (filterTag && meta.tag_name !== filterTag) return;
          if (selectedTeams.length > 0) {
            const { allTeams } = getTaskTeams(meta.sub_tasks, meta.team_name);
            const hasMatchingTeam = allTeams.some(t => selectedTeams.includes(t));
            if (!hasMatchingTeam) return;
          }
          if (selectedTaskTypes.length > 0 && !selectedTaskTypes.includes((task.task_type || '').toUpperCase())) return;

          // Filter check dynamic Assignee (Sub-tasks or Main assignees)
          if (filterPersonnel) {
            const hasInSubTask = meta.sub_tasks && meta.sub_tasks.some((s: any) => s.assignee === filterPersonnel);
            const hasInMain = Array.isArray((task as any).assignees) && (task as any).assignees.includes(filterPersonnel);
            if (!hasInSubTask && !hasInMain) return;
          }

          // RULE: If ONETIME is inactive (OFF), only keep if done or skipped!
          if (!task.is_active && todo_status !== 'DONE' && todo_status !== 'SKIPPED') {
            return;
          }

          if (todo_date >= startDate && todo_date <= endDate) {
            const subTasksResolved = target.sub_tasks || meta.sub_tasks || [];

            // Calculate task status under the new rules for OneTime tasks
            let finalStatus = 'NEW';
            if (filterPersonnel) {
              const userSubTasks = subTasksResolved.filter((s: any) => s.assignee === filterPersonnel);
              if (userSubTasks.length > 0) {
                if (todo_status === 'DONE') {
                  const hasUserDone = userSubTasks.some((s: any) => s.sub_status === 'Done');
                  if (hasUserDone) {
                    finalStatus = 'DONE';
                  } else {
                    const allUserSkipped = userSubTasks.every((s: any) => s.sub_status === 'Skipped');
                    finalStatus = allUserSkipped ? 'SKIPPED' : 'NEW';
                  }
                } else if (todo_status === 'SKIPPED') {
                  finalStatus = 'SKIPPED';
                } else {
                  finalStatus = 'NEW';
                }
              } else {
                finalStatus = todo_status;
              }
            } else {
              finalStatus = todo_status;
            }

            let actual_time = 0;
            let est_time = 0;

            if (filterPersonnel) {
              const userSubTasks = subTasksResolved.filter((s: any) => s.assignee === filterPersonnel);
              if (userSubTasks.length > 0) {
                actual_time = userSubTasks.reduce((sum, s: any) => sum + (s.sub_status === 'Done' ? (s.actual_minutes || 0) : 0), 0);
                est_time = userSubTasks.reduce((sum, s: any) => sum + (s.estimated_minutes || 0), 0);
              } else {
                const hasInMain = Array.isArray((task as any).assignees) && (task as any).assignees.includes(filterPersonnel);
                if (hasInMain) {
                  actual_time = task.actual_time || 0;
                  est_time = task.est_time || 0;
                }
              }
            } else {
              actual_time = target.actual_time || subTasksResolved.reduce((sum, s: any) => sum + (s.sub_status === 'Done' ? (s.actual_minutes || 0) : 0), 0) || 0;
              est_time = subTasksResolved.reduce((sum, s: any) => sum + (s.estimated_minutes || 0), 0) || task.est_time || 0;
            }

            list.push({
              ...task,
              todo_date,
              todo_status: finalStatus,
              est_time,
              actual_time
            });
          }
        });
      }
    });

    return list;
  }, [tasks, startDate, endDate, filterPersonnel, filterProject, filterTag, filterTeam, selectedTaskTypes, getTaskTeams]);

  // Compute stat metrics for the 5 Overview cards from the stats list
  const stats = useMemo(() => {
    const total = statsVirtualTasks.length;
    const completed = statsVirtualTasks.filter(t => t.todo_status === 'DONE').length;
    const skipped = statsVirtualTasks.filter(t => t.todo_status === 'SKIPPED').length;
    
    const totalEst = statsVirtualTasks.reduce((acc, t) => acc + (t.est_time || 0), 0);
    const totalAct = statsVirtualTasks.reduce((acc, t) => acc + (t.actual_time || 0), 0);

    return {
      total,
      completed,
      skipped,
      totalEst,
      totalAct
    };
  }, [statsVirtualTasks]);

  // Solve Roadmap - EXCLUDES Date Filter range but strictly honors the Assignee, Project, Tag, Team filters
  const roadmapDaysData = useMemo(() => {
    return weekDays.map(day => {
      const dayTasks: any[] = [];
      tasks.forEach(task => {
        const meta = parseDescriptionMeta(task.description);
        // Backwards-compatible override using direct database properties
        meta.project_name = task.projects?.name || meta.project_name;
        meta.team_name = task.teams?.name || meta.team_name;
        meta.tag_name = task.tags?.name || meta.tag_name;
        meta.deadline_days = task.deadline_days || meta.deadline_days;
        meta.deadline_time = task.deadline_time ? task.deadline_time.slice(0, 5) : meta.deadline_time;
        if (task.subtasks && task.subtasks.length > 0) {
          const uniqueSubtasks = task.subtasks.filter((sub: any, index: number, self: any[]) =>
            self.findIndex((s: any) => s.id === sub.id) === index
          );
          meta.sub_tasks = uniqueSubtasks.map((st: any) => ({
            id: st.subtask_id || st.id,
            content: st.content,
            name: st.content,
            assignee: st.assignee,
            estimated_minutes: st.estimated_minutes
          }));
        }

        const isRecurring = ['DAILY', 'WEEKLY', 'MONTHLY', 'ONETIME'].includes((task.task_type || '').toUpperCase());

        if (isRecurring) {
          const occurrences = getVirtualOccurrences(
            task.task_type || '',
            meta.deadline_days || '',
            task.created_at || '',
            day.dateString,
            day.dateString,
            true // bypassCreatedAt for stable roadmap counts across days of the week
          );
          
          occurrences.forEach(occ => {
            const completions = meta.completions || {};
            const completion = completions[occ.completion_key] || completions[occ.todo_date];
            const todo_status = completion?.todo_status || 'NEW';

            // RULE: If template is inactive (OFF), only keep historical done or skipped days!
            if (!task.is_active && todo_status !== 'DONE' && todo_status !== 'SKIPPED') {
              return;
            }

            // If status is NEW, bypass historical versions lookup to guarantee immediate template updates today!
            const isNewStatus = todo_status === 'NEW';
            const activeVersion = isNewStatus ? null : getTaskVersionForDate(meta, occ.todo_date);
            const project_name = activeVersion ? activeVersion.project_name : meta.project_name;
            const team_name = activeVersion ? activeVersion.team_name : meta.team_name;
            const tag_name = activeVersion ? activeVersion.tag_name : meta.tag_name;
            const sub_tasks = activeVersion ? activeVersion.sub_tasks : meta.sub_tasks;

            // Map sub-tasks dynamically: merge template subtasks with existing completion progress if NEW
            let subTasksResolved;
            if (isNewStatus) {
              const existingSubs = completion?.sub_tasks || [];
              subTasksResolved = sub_tasks.map((s: any) => {
                const existing = existingSubs.find((ext: any) => ext.id === s.id);
                return {
                  ...s,
                  sub_status: existing ? existing.sub_status : ('New' as const),
                  actual_minutes: existing ? existing.actual_minutes : 0
                };
              });
            } else {
              subTasksResolved = completion?.sub_tasks || sub_tasks.map((s: any) => ({
                ...s,
                sub_status: 'New' as const,
                actual_minutes: 0
              }));
            }

            // Filter check side indicators
            if (filterProject && project_name !== filterProject) return;
            if (filterTag && tag_name !== filterTag) return;
            if (selectedTeams.length > 0) {
              const { allTeams } = getTaskTeams(subTasksResolved, team_name);
              const hasMatchingTeam = allTeams.some(t => selectedTeams.includes(t));
              if (!hasMatchingTeam) return;
            }
            if (selectedTaskTypes.length > 0 && !selectedTaskTypes.includes((task.task_type || '').toUpperCase())) return;

            // Filter check Assignee (subtasks or main)
            if (filterPersonnel) {
              const hasInSubTask = subTasksResolved && subTasksResolved.some((s: any) => s.assignee === filterPersonnel);
              const hasInMain = Array.isArray((task as any).assignees) && (task as any).assignees.includes(filterPersonnel);
              if (!hasInSubTask && !hasInMain) return;
            }

            let est_time_for_day = 0;
            if (filterPersonnel) {
              const userSub = subTasksResolved.filter((s: any) => s.assignee === filterPersonnel);
              if (userSub.length > 0) {
                est_time_for_day = userSub.reduce((sum: number, s: any) => sum + (s.estimated_minutes || 0), 0);
              } else {
                const hasInMain = Array.isArray((task as any).assignees) && (task as any).assignees.includes(filterPersonnel);
                if (hasInMain) {
                  est_time_for_day = task.est_time || 0;
                }
              }
            } else {
              est_time_for_day = subTasksResolved.reduce((sum: number, s: any) => sum + (s.estimated_minutes || 0), 0) || task.est_time || 0;
            }

            dayTasks.push({
              ...task,
              est_time: est_time_for_day
            });
          });
        } else {
          // ONETIME task
          const targets = (meta.onetime_targets && meta.onetime_targets.length > 0)
            ? meta.onetime_targets
            : [{
                id: '1',
                date: meta.todo_date || (meta.deadline_days && /^\d{4}-\d{2}-\d{2}$/.test(meta.deadline_days) ? meta.deadline_days : task.created_at?.split('T')[0]),
                time: meta.deadline_time || '17:00',
                todo_status: meta.todo_status || 'NEW',
                sub_tasks: meta.sub_tasks || []
              }];

          targets.forEach((target: any) => {
            const todo_date = target.date;
            const todo_status = target.todo_status || 'NEW';

            // RULE: If ONETIME is inactive (OFF), only keep if done or skipped! (Added check to match Overview)
            if (!task.is_active && todo_status !== 'DONE' && todo_status !== 'SKIPPED') {
              return;
            }

            if (todo_date === day.dateString) {
              const activeVersion = getTaskVersionForDate(meta, day.dateString);
              const project_name = activeVersion ? activeVersion.project_name : meta.project_name;
              const team_name = activeVersion ? activeVersion.team_name : meta.team_name;
              const tag_name = activeVersion ? activeVersion.tag_name : meta.tag_name;
              const subTasksResolved = target.sub_tasks || (activeVersion ? activeVersion.sub_tasks : meta.sub_tasks) || [];

              // Filter check side indicators
              if (filterProject && project_name !== filterProject) return;
              if (filterTag && tag_name !== filterTag) return;
              if (selectedTeams.length > 0) {
                const { allTeams } = getTaskTeams(subTasksResolved, team_name);
                const hasMatchingTeam = allTeams.some(t => selectedTeams.includes(t));
                if (!hasMatchingTeam) return;
              }
              if (selectedTaskTypes.length > 0 && !selectedTaskTypes.includes((task.task_type || '').toUpperCase())) return;

              // Filter check Assignee (subtasks or main)
              if (filterPersonnel) {
                const hasInSubTask = subTasksResolved && subTasksResolved.some((s: any) => s.assignee === filterPersonnel);
                const hasInMain = Array.isArray((task as any).assignees) && (task as any).assignees.includes(filterPersonnel);
                if (!hasInSubTask && !hasInMain) return;
              }

              let est_time_for_day = 0;
              if (filterPersonnel) {
                const userSub = subTasksResolved.filter((s: any) => s.assignee === filterPersonnel);
                if (userSub.length > 0) {
                  est_time_for_day = userSub.reduce((sum: number, s: any) => sum + (s.estimated_minutes || 0), 0);
                } else {
                  const hasInMain = Array.isArray((task as any).assignees) && (task as any).assignees.includes(filterPersonnel);
                  if (hasInMain) {
                    est_time_for_day = task.est_time || 0;
                  }
                }
              } else {
                est_time_for_day = subTasksResolved.reduce((sum: number, s: any) => sum + (s.estimated_minutes || 0), 0) || task.est_time || 0;
              }

              dayTasks.push({
                ...task,
                est_time: est_time_for_day
              });
            }
          });
        }
      });

      const dailyTypeTasks = dayTasks.filter(t => (t.task_type || '').toUpperCase() === 'DAILY');
      const weeklyTypeTasks = dayTasks.filter(t => (t.task_type || '').toUpperCase() === 'WEEKLY');
      const monthlyTypeTasks = dayTasks.filter(t => (t.task_type || '').toUpperCase() === 'MONTHLY');
      const onetimeTypeTasks = dayTasks.filter(t => (t.task_type || '').toUpperCase() === 'ONETIME');

      const dayRows = [
        {
          label: 'Total',
          count: dayTasks.length,
          estMinutes: dayTasks.reduce((sum, t) => sum + (t.est_time || 0), 0),
          isTotal: true
        },
        {
          label: 'Daily',
          count: dailyTypeTasks.length,
          estMinutes: dailyTypeTasks.reduce((sum, t) => sum + (t.est_time || 0), 0)
        },
        {
          label: 'Weekly',
          count: weeklyTypeTasks.length,
          estMinutes: weeklyTypeTasks.reduce((sum, t) => sum + (t.est_time || 0), 0)
        },
        {
          label: 'Monthly',
          count: monthlyTypeTasks.length,
          estMinutes: monthlyTypeTasks.reduce((sum, t) => sum + (t.est_time || 0), 0)
        },
        {
          label: 'Onetime',
          count: onetimeTypeTasks.length,
          estMinutes: onetimeTypeTasks.reduce((sum, t) => sum + (t.est_time || 0), 0)
        }
      ];

      return {
        day,
        dayRows
      };
    });
  }, [tasks, weekDays, filterPersonnel, filterProject, filterTag, filterTeam, selectedTaskTypes, getTaskTeams]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 overflow-x-auto text-left font-sans">
      
      {/* FILTER HEADER BAR */}
      <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0 flex items-center justify-between gap-4 flex-nowrap overflow-visible relative z-[40] min-w-max w-full select-none">
        <div className="flex items-center gap-2 shrink-0 flex-nowrap">
          {/* PERSONNEL SELECT dropdown */}
          <SearchableFilterSelect
            value={filterPersonnel}
            onChange={(val) => {
              setFilterPersonnel(val);
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
            options={currentAssignees.map(assignee => ({ 
              value: assignee, 
              label: assignee 
            }))}
            className="h-8 w-[190px] min-w-[190px] max-w-[190px]"
          />

          {/* PROJECTS SELECT dropdown */}
          <FilterSelect
            value={filterProject}
            onChange={setFilterProject}
            defaultOptionLabel="Projects"
            options={currentProjects.map(project => ({ value: project, label: project }))}
            className="h-8 w-[190px] min-w-[190px] max-w-[190px]"
            id="projects-select"
          />

          {/* TAGS SELECT dropdown */}
          <FilterSelect
            value={filterTag}
            onChange={setFilterTag}
            defaultOptionLabel="Tags"
            options={currentTags.map(tag => ({ value: tag, label: tag }))}
            className="h-8 w-[120px] min-w-[120px] max-w-[120px]"
            id="tags-select"
          />

          {/* TEAMS SELECT dropdown */}
          <MultiTeamFilterSelect
            value={filterTeam}
            onChange={(val) => {
              setFilterTeam(val);
              if (val) {
                const nextSelected = val.split(',').filter(Boolean);
                if (filterPersonnel && nextSelected.length > 0) {
                  const companionTeams = userToTeamsMap[filterPersonnel] || [];
                  const hasMatch = companionTeams.some(t => nextSelected.includes(t));
                  if (!hasMatch) {
                    setFilterPersonnel('');
                  }
                }
              }
            }}
            defaultOptionLabel="Teams"
            options={currentTeams.map(team => ({ value: team, label: team }))}
            className="h-8 w-[120px] min-w-[120px] max-w-[120px]"
          />

          {/* TASK TYPE Filter */}
          <MultiTeamFilterSelect
            value={filterTaskType}
            onChange={setFilterTaskType}
            defaultOptionLabel="Type"
            options={[
              { value: 'DAILY', label: 'Daily' },
              { value: 'WEEKLY', label: 'Weekly' },
              { value: 'MONTHLY', label: 'Monthly' },
              { value: 'ONETIME', label: 'Onetime' }
            ]}
            className="h-8 w-[100px] min-w-[100px] max-w-[100px]"
          />

          {/* DATE RANGE FILTER PICKER */}
          <DateRangePicker 
            startDate={startDate}
            endDate={endDate}
            onChange={(start, end) => {
              setStartDate(start);
              setEndDate(end);
            }}
            className="h-8 shadow-sm"
            id="date-picker"
          />

          {/* Reset Filters trigger as icon after date picker */}
          {(filterPersonnel !== (profile?.name || '') || filterProject || filterTag || filterTeam || filterTaskType || startDate !== getLocalDateString(new Date()) || endDate !== getLocalDateString(new Date())) && (
            <button 
              onClick={() => {
                setFilterPersonnel(profile?.name || '');
                setFilterProject('');
                setFilterTag('');
                setFilterTeam('');
                setFilterTaskType('');
                setStartDate(getLocalDateString(new Date()));
                setEndDate(getLocalDateString(new Date()));
              }}
              className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Reset filters"
              id="reset-dashboard-filters"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      {/* DASHBOARD GRID CONTENT */}
      <div className="flex-1 flex flex-col p-4 gap-4 min-h-0 overflow-y-auto bg-slate-50/40">
        
        {/* DATABASE CONNECTION OR QUERY ERROR BOX */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-750 p-3 rounded-md flex items-start gap-2 shadow-sm shrink-0" id="db-error-box">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-left">
              <span className="font-semibold block text-xs">Dataset connection error</span>
              <span className="text-xs text-rose-600/90 font-medium">{error}</span>
            </div>
          </div>
        )}

        {/* 1. SECTION 1: 5 OVERVIEW CARDS WITH SKELETON LOAD SUPPORT */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 shrink-0" id="metrics-loading-skeletons">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div 
                key={idx} 
                className="bg-white p-3.5 rounded-md border border-slate-200 shadow-sm flex flex-col justify-between h-[106px] animate-pulse"
              >
                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                <div className="h-9 bg-slate-200 rounded w-2/3 mt-2"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 shrink-0" id="metrics-cards-grid">
            
            {/* CARD 1: TOTAL TASKS */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-md" id="card-total-tasks">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-bold text-slate-500 tracking-tight">Total Tasks</span>
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shadow-sm shadow-indigo-600/5">
                  <ClipboardList className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-1 text-left">
                <h3 className="text-2xl font-black text-slate-800 leading-none tracking-tight">
                  {stats.total}
                </h3>
                <p className="text-xs font-semibold text-slate-400 mt-2 truncate">
                  Total checklists within date range
                </p>
              </div>
            </div>

            {/* CARD 2: COMPLETED */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-md" id="card-completed-tasks">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-bold text-emerald-700 tracking-tight">Completed</span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shadow-sm shadow-emerald-600/5">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-1 text-left">
                <h3 className="text-2xl font-black text-emerald-600 leading-none tracking-tight">
                  {stats.completed}
                </h3>
                <p className="text-xs font-semibold text-slate-400 mt-2 truncate">
                  Tasks completed successfully
                </p>
              </div>
            </div>

            {/* CARD 3: SKIPPED */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-md" id="card-skipped-tasks">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-bold text-amber-700 tracking-tight">Skipped</span>
                <div className="p-2 bg-amber-50 text-amber-500 rounded-lg shadow-sm shadow-amber-500/5">
                  <FastForward className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-1 text-left">
                <h3 className="text-2xl font-black text-slate-700 leading-none tracking-tight">
                  {stats.skipped}
                </h3>
                <p className="text-xs font-semibold text-slate-400 mt-2 truncate">
                  Tasks marked as skipped
                </p>
              </div>
            </div>

            {/* CARD 4: ESTIMATED TIME */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-md" id="card-est-time">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-bold text-slate-500 tracking-tight">Estimated Hours</span>
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shadow-sm shadow-indigo-600/5">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-1 text-left min-w-0">
                <h3 className="text-xl font-black text-indigo-950 truncate leading-none tracking-tight">
                  {formatDuration(stats.totalEst)}
                </h3>
                <p className="text-xs font-semibold text-slate-400 mt-2 truncate">
                  Total hours allocated
                </p>
              </div>
            </div>

            {/* CARD 5: ACTUAL TIME */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between transition-all hover:border-slate-300 hover:shadow-md" id="card-actual-time">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-bold text-slate-500 tracking-tight">Actual Hours</span>
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shadow-sm shadow-emerald-600/5">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-1 text-left min-w-0">
                <h3 className="text-xl font-black text-emerald-600 truncate leading-none tracking-tight">
                  {formatDuration(stats.totalAct)}
                </h3>
                <p className="text-xs font-semibold text-slate-400 mt-2 truncate">
                  Actual task duration spent
                </p>
              </div>
            </div>

          </div>
        )}

        {/* 2. SECTION 2: WEEKLY ROADMAP BREAKDOWN */}
        <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4 overflow-hidden" id="weekly-roadmap-section">
          
          {/* Section Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0 select-none">
            <div>
              <h3 className="text-base font-bold text-slate-800 tracking-tight">
                Weekly Roadmap
              </h3>
              <p className="text-xs font-medium text-slate-400 mt-0.5">
                Date filters are bypassed to display recurring tasks, aligning strictly with selected personnel assignments.
              </p>
            </div>
          </div>

          {/* SKELETON LOAD IN THE ROADMAP GRID */}
          {loading ? (
            <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3.5 min-h-0" id="roadmap-loading-skeletons">
              {weekDays.map((day) => (
                <div 
                  key={day.name} 
                  className="bg-white rounded-xl border border-slate-200 flex flex-col justify-between overflow-hidden shadow-sm h-full p-4 space-y-3 animate-pulse"
                >
                  <div className="h-5 bg-slate-200 rounded w-1/3 mb-1"></div>
                  <div className="flex-1 flex flex-col gap-2">
                    {[1, 2, 3, 4, 5].map((rowIdx) => (
                      <div key={rowIdx} className="h-[42px] bg-slate-200 rounded-lg w-full"></div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3.5 min-h-0" id="roadmap-grid">
              {roadmapDaysData.map(({ day, dayRows }) => {
                const totalRow = dayRows.find(r => r.isTotal) || { label: 'Total', count: 0, estMinutes: 0 };
                const categorizedRows = dayRows.filter(r => !r.isTotal);

                return (
                  <div 
                    key={day.name} 
                    className={`bg-white rounded-xl border flex flex-col justify-between overflow-hidden relative shadow-sm h-full transition-all duration-300 ${
                      day.isToday 
                        ? 'border-indigo-500 ring-2 ring-indigo-50/70 bg-indigo-50/5' 
                        : 'border-slate-200 hover:border-slate-350 hover:shadow'
                    }`}
                  >
                    {/* Column element header */}
                    <div className={`px-3.5 py-2.5 flex flex-col items-start justify-between relative shrink-0 ${
                      day.isToday ? 'bg-indigo-50/20' : 'bg-slate-50/50'
                    }`}>
                      <div className="flex items-center justify-between w-full">
                        <span className={`text-[13px] font-bold tracking-tight ${
                          day.isToday ? 'text-indigo-600' : 'text-slate-800'
                        }`}>
                          {day.name}
                        </span>
                        
                        {day.isToday && (
                          <span className="bg-indigo-600 text-[10px] font-bold text-white px-2 py-0.5 rounded-full shadow-md shadow-indigo-600/10 scale-90">
                            Today
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Columns data cells (Total first as Hero banner, then localized categories) */}
                    <div className="flex-1 flex flex-col p-3 min-h-0 gap-3 pb-3.5">
                      
                      {/* HERO TOTAL ROADMAP BLOCK */}
                      <div className={`p-3 rounded-xl border flex items-center justify-between transition-all duration-350 select-none ${
                          day.isToday 
                            ? 'roadmap-hero-today'
                            : 'roadmap-hero-standard'
                        }`}
                      >
                        <div className="flex flex-col text-left">
                          <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest leading-none">
                            Total Tasks
                          </span>
                          <span className="text-xl font-black text-slate-800 mt-2 leading-none">
                            {totalRow.count} <span className="text-xs font-semibold text-slate-400 tracking-normal normal-case">task{totalRow.count !== 1 ? 's' : ''}</span>
                          </span>
                        </div>
                        <div className="flex flex-col text-right">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                            Est Duration
                          </span>
                          <span className="text-sm font-black text-indigo-700 mt-2 leading-none">
                            {formatDuration(totalRow.estMinutes)}
                          </span>
                        </div>
                      </div>

                      {/* Decent elegant breakdown line */}
                      <div className="flex items-center gap-1.5 px-0.5 shrink-0 py-0.5">
                        <div className="h-[1px] bg-slate-100/80 flex-1"></div>
                        <span className="text-[9px] text-slate-400 font-bold tracking-wider uppercase leading-none px-1">Breakdown</span>
                        <div className="h-[1px] bg-slate-100/80 flex-1"></div>
                      </div>

                      {/* CATEGORIZED SUB-BLOCK LIST */}
                      <div className="flex-1 flex flex-col justify-between gap-1.5 min-h-0">
                        {categorizedRows.map((row) => {
                          const labelUpper = row.label.toUpperCase();
                          let rowBgClass = 'border border-slate-50 hover:bg-slate-50/50';
                          let labelColorClass = 'text-slate-400';
                          
                          if (labelUpper === 'DAILY') {
                            rowBgClass = 'roadmap-cat-row roadmap-cat-daily';
                            labelColorClass = 'text-blue-750';
                          } else if (labelUpper === 'WEEKLY') {
                            rowBgClass = 'roadmap-cat-row roadmap-cat-weekly';
                            labelColorClass = 'text-amber-750';
                          } else if (labelUpper === 'MONTHLY') {
                            rowBgClass = 'roadmap-cat-row roadmap-cat-monthly';
                            labelColorClass = 'text-emerald-750';
                          } else if (labelUpper === 'ONETIME') {
                            rowBgClass = 'roadmap-cat-row roadmap-cat-onetime';
                            labelColorClass = 'text-rose-750';
                          }

                          return (
                            <div 
                              key={row.label}
                              className={`flex-1 flex items-center justify-between px-3 py-1.5 rounded-lg transition-all duration-150 ${rowBgClass}`}
                            >
                              {/* Title of Category */}
                              <div className="flex flex-col justify-center text-left">
                                <span className={`text-[9px] font-bold leading-none uppercase tracking-wider ${labelColorClass}`}>
                                  {row.label}
                                </span>
                                <span className="text-xs font-bold leading-none mt-1.5 text-slate-700">
                                  {row.count} task{row.count !== 1 ? 's' : ''}
                                </span>
                              </div>

                              {/* Estimated duration right side */}
                              <div className="text-right flex flex-col justify-center">
                                <span className="text-[8px] text-slate-400 font-semibold uppercase leading-none">Est</span>
                                <span className="text-[11px] font-extrabold mt-1.5 leading-none text-slate-600">
                                  {formatDuration(row.estMinutes)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
