import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getTaskTeams(
  taskSubtasks: any[],
  fallbackTeamName: string = '',
  userToTeamsMap: Record<string, string[]> = {}
) {
  const assignees = taskSubtasks?.map(s => s.assignee).filter(Boolean) || [];
  if (assignees.length === 0) {
    const cleanFallback = fallbackTeamName ? fallbackTeamName.replace(/[\[\]"]/g, '').trim() : '';
    return {
      display: cleanFallback || 'No Team',
      allTeams: cleanFallback ? [cleanFallback] : []
    };
  }

  const resolvedTeams: string[] = [];
  const uniqueAssignees = Array.from(new Set(assignees));
  uniqueAssignees.forEach(name => {
    const teams = userToTeamsMap[name] || [];
    teams.forEach(t => {
      if (!resolvedTeams.includes(t)) {
        resolvedTeams.push(t);
      }
    });
  });

  if (resolvedTeams.length === 0) {
    const cleanFallback = fallbackTeamName ? fallbackTeamName.replace(/[\[\]"]/g, '').trim() : '';
    return {
      display: cleanFallback || 'No Team',
      allTeams: cleanFallback ? [cleanFallback] : []
    };
  }

  // First assignee's team
  const firstSubtaskAssignee = taskSubtasks.find(s => s.assignee)?.assignee;
  const firstAssigneeTeams = firstSubtaskAssignee ? (userToTeamsMap[firstSubtaskAssignee] || []) : [];
  const firstTeam = firstAssigneeTeams[0] || resolvedTeams[0];

  // Find other unique teams (excluding firstTeam)
  const remainingCount = resolvedTeams.filter(t => t !== firstTeam).length;
  const display = remainingCount > 0 ? `${firstTeam} +${remainingCount}` : firstTeam;

  return {
    display,
    allTeams: resolvedTeams
  };
}
