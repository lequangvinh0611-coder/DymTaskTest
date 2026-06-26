import { useEffect } from 'react';
import { useAppStore } from '../types';

export const useDashboardData = () => {
  const {
    tasks,
    projectsList,
    teamsList,
    tagsList,
    assigneesList,
    tasksLoaded,
    tasksLoading,
    fetchTasks,
    fetchMetadata
  } = useAppStore();

  useEffect(() => {
    // Silent background updates for state freshness
    fetchTasks(true);
    fetchMetadata(true);
  }, []);

  return {
    tasks,
    loading: !tasksLoaded && tasksLoading,
    error: null,
    projectsList,
    teamsList,
    tagsList,
    assigneesList,
    refetch: fetchTasks,
    refreshMetadata: fetchMetadata
  };
};
