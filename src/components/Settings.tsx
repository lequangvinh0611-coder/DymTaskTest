import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Loader2, Users, FolderKanban, ShieldCheck, Tag as TagIcon, Settings2, Search, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import MasterDataModal from './MasterDataModal';
import UserEditModal from './UserEditModal';
import UserCreateModal from './UserCreateModal';
import { cn } from '../lib/utils';
import { logger } from '../lib/logger';
import { useAuthStore } from '../store/authStore';
import { useAppStore } from '../types';
import { toast } from 'sonner';

type TabType = 'USERS' | 'PROJECTS' | 'TEAMS' | 'TAGS';

export default function Settings() {
  const { showConfirm, activeTab: globalActiveTab } = useAppStore();
  const { currentUser, profile } = useAuthStore();
  const activeUser = currentUser || profile;
  const isAdmin = (activeUser?.role || 'user').toString().toLowerCase().trim() === 'admin' || activeUser?.role === 'Admin';
  const [activeTab, setActiveTab] = useState<TabType>('USERS');

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);
  
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);

  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isUserCreateModalOpen, setIsUserCreateModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [
        { data: usersData },
        { data: projectsData },
        { data: teamsData },
        { data: tagsData }
      ] = await Promise.all([
        supabase.from('users').select('id, email, name, role, team_ids, status, created_at').order('created_at', { ascending: false }),
        supabase.from('projects').select('*').order('created_at', { ascending: false }),
        supabase.from('teams').select('*').order('created_at', { ascending: false }),
        supabase.from('tags').select('*').order('created_at', { ascending: false })
      ]);

      setUsers(usersData || []);
      setProjects(projectsData || []);
      setTeams(teamsData || []);
      setTags(tagsData || []);

      // Đồng bộ hóa tức thì danh sách master data (users, teams, projects, tags) lên store toàn cục
      useAppStore.getState().fetchMetadata(true);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (globalActiveTab !== 'SETTINGS') return;

    fetchData();
  }, [globalActiveTab]);

  const handleAdd = () => {
    if (activeTab === 'USERS' && isAdmin) {
      toast.error("You do not have permission to perform this action!");
      return;
    }
    setEditingItem(null);
    if (activeTab === 'USERS') {
      setIsUserCreateModalOpen(true);
    } else {
      setIsMasterModalOpen(true);
    }
  };

  const handleEdit = (item: any) => {
    if (activeTab === 'USERS' && isAdmin) {
      toast.error("You do not have permission to perform this action!");
      return;
    }
    setEditingItem(item);
    if (activeTab === 'USERS') {
      setIsUserModalOpen(true);
    } else {
      setIsMasterModalOpen(true);
    }
  };

  const handleSaveMasterData = async (name: string) => {
    const tableName = activeTab.toLowerCase();
    const formattedName = name.trim().toUpperCase();
    
    try {
      if (editingItem) {
        const oldName = editingItem.name?.toString().toUpperCase().trim();
        const newName = formattedName;
        
        if (oldName && newName && oldName !== newName) {
          // 1. If we are editing Teams, update user team_ids
          if (activeTab === 'TEAMS') {
            const { data: allUsers } = await supabase.from('users').select('*');
            if (allUsers) {
              for (const u of allUsers) {
                const userTeams = Array.isArray(u.team_ids) ? u.team_ids : [];
                const cleanTeams = userTeams.map((t: any) => t.toString().toUpperCase().trim());
                if (cleanTeams.includes(oldName)) {
                  const updatedTeams = cleanTeams.map(t => t === oldName ? newName : t);
                  await supabase.from('users').update({ team_ids: updatedTeams }).eq('id', u.id);
                }
              }
            }
          }

          // 2. Direct RDBMS update on task and subtask fields based on activeTab (Projects, Teams, Tags)
          if (activeTab === 'PROJECTS') {
            await supabase
              .from('tasks')
              .update({ project_name: newName })
              .eq('project_name', oldName);
          } else if (activeTab === 'TEAMS') {
            await supabase
              .from('subtasks')
              .update({ team_name: newName })
              .eq('team_name', oldName);
              
            await supabase
              .from('subtask_logs')
              .update({ team_name: newName })
              .eq('team_name', oldName);
          } else if (activeTab === 'TAGS') {
            await supabase
              .from('tasks')
              .update({ tag_name: newName })
              .eq('tag_name', oldName);
          }
        }
        
        await supabase.from(tableName).update({ name: formattedName }).eq('id', editingItem.id);
        await logger.log('UPDATE_MASTER_DATA', `Updated item in ${tableName} to ${formattedName}`, { id: editingItem.id });
        toast.success(`Successfully saved changes for ${tableName}!`);
      } else {
        await supabase.from(tableName).insert([{ name: formattedName }]);
        await logger.log('CREATE_MASTER_DATA', `Created item in ${tableName} named ${formattedName}`);
        toast.success(`Successfully created new ${tableName}!`);
      }
      fetchData();
    } catch (error: any) {
      toast.error(`Error saving ${tableName}: ${error.message}`);
    }
  };

  const handleCreateUser = async (data: { name: string; email: string; role: string; teams: string[] }) => {
    try {
      const newId = crypto.randomUUID();
      const { error } = await supabase
        .from('users')
        .insert([{
          id: newId,
          name: data.name,
          email: data.email,
          role: data.role.toLowerCase(),
          team_ids: data.teams,
          status: 'ACTIVE'
        }]);

      if (error) throw error;

      await logger.log('CREATE_USER', `Created new user ${data.email}`, { name: data.name, role: data.role });
      
      fetchData();
      toast.success("Staff added successfully!");
      setIsUserCreateModalOpen(false);
    } catch (err: any) {
      console.error('[Settings] Error creating user:', err);
      if (err.code === '23505') {
        toast.error("Email already exists in the system!");
      } else {
        toast.error(`Error adding staff: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const handleSaveUser = async (userId: string, data: { name?: string; role: string; status: string; teams: string[] }) => {
    const userToUpdate = users.find(u => u.id === userId);
    
    // Safety check for Master email
    if (userToUpdate?.role?.toString().toLowerCase().trim() === 'master' && data.role.toUpperCase() !== 'MASTER') {
      toast.warning('Cannot downgrade the Master account role.');
      return;
    }

    try {
      console.log('[Settings] Updating user:', userId, data);
      
      const oldName = userToUpdate?.name;
      const newName = data.name?.trim();
      
      if (oldName && newName && oldName !== newName) {
        // Direct RDBMS update on subtasks table where assignee is located
        await supabase
          .from('subtasks')
          .update({ assignee: newName })
          .eq('assignee', oldName);
      }

      const { error } = await supabase
        .from('users')
        .update({
          name: data.name,
          role: data.role.toLowerCase(),
          status: data.status.toUpperCase(),
          team_ids: data.teams
        })
        .eq('id', userId);

      if (error) {
        console.error('[Settings] Supabase Update Error:', error);
        throw error;
      }
      
      await logger.log('UPDATE_USER', `Updated user settings for ${userToUpdate?.email}`, { userId, updates: data });
      toast.success('Staff information updated successfully!');
      fetchData();
    } catch (err: any) {
      console.error('[Settings] Full Error Object:', err);
      toast.error(`Error updating user: ${err.message || 'Unknown error'}`);
    }
  };

  const handleDelete = async (id: string, itemEmail?: string) => {
    if (activeTab === 'USERS' && isAdmin) {
      toast.error("You do not have permission to perform this action!");
      return;
    }

    // Safety checks
    if (activeTab === 'USERS') {
      const uObj = users.find(u => u.id === id);
      if (uObj?.role?.toString().toLowerCase().trim() === 'master') {
        toast.error('Master account cannot be deleted.');
        return;
      }
    }

    try {
      // 1. Fetch all tasks to validate relationship rules
      const { data: activeTasks, error: taskErr } = await supabase
        .from('tasks')
        .select('*');

      if (taskErr) {
        toast.error(`Error checking validation rules: ${taskErr.message}`);
        return;
      }

      // Filter tasks where is_active is true or status is 'ON'
      const filteredActiveTasks = (activeTasks || []).filter(
        (t: any) => t.is_active === true || String(t.status || '').toUpperCase() === 'ON'
      );

      // Validation Checks based on Tab Type
      if (activeTab === 'USERS') {
        const userObj = users.find(u => u.id === id);
        if (userObj) {
          const userName = userObj.name;
          const isAssigned = filteredActiveTasks.some((task: any) => {
            const hasInAssigneesField = Array.isArray(task.assignees) && task.assignees.includes(userName);
            let hasInSubtasks = false;
            if (task.description) {
              try {
                const parsed = JSON.parse(String(task.description));
                const subs = Array.isArray(parsed.sub_tasks) ? parsed.sub_tasks : [];
                hasInSubtasks = subs.some((s: any) => s.assignee === userName);
              } catch (_) {}
            }
            return hasInAssigneesField || hasInSubtasks;
          });

          if (isAssigned) {
            toast.warning("Cannot delete this staff member because they are assigned to active tasks!");
            return;
          }
        }
      }

      if (activeTab === 'PROJECTS') {
        const projObj = projects.find(p => p.id === id);
        if (projObj) {
          const isLinked = filteredActiveTasks.some((task: any) => {
            const matchId = task.project_id === id;
            let matchName = false;
            if (task.description) {
              try {
                const parsed = JSON.parse(String(task.description));
                matchName = parsed.project_name === projObj.name;
              } catch (_) {}
            }
            return matchId || matchName;
          });

          if (isLinked) {
            toast.warning("Cannot delete this project because it contains active tasks!");
            return;
          }
        }
      }

      if (activeTab === 'TAGS') {
        const tagObj = tags.find(t => t.id === id);
        if (tagObj) {
          const isLinked = filteredActiveTasks.some((task: any) => {
            const matchId = task.tag_id === id;
            let matchName = false;
            if (task.description) {
              try {
                const parsed = JSON.parse(String(task.description));
                matchName = parsed.tag_name === tagObj.name;
              } catch (_) {}
            }
            return matchId || matchName;
          });

          if (isLinked) {
            toast.warning("Cannot delete this tag because it is being used by active tasks!");
            return;
          }
        }
      }

      if (activeTab === 'TEAMS') {
        const teamObj = teams.find(t => t.id === id);
        if (teamObj) {
          const hasActiveMembers = users.some(u => {
            const isActiveUser = u.status === 'ACTIVE';
            if (!isActiveUser) return false;

            const userTeams = Array.isArray(u.team_ids) ? u.team_ids : Array.isArray(u.teams) ? u.teams : [];
            const cleanTeams = userTeams.map((t: any) => t.toString().replace(/[\[\]"]/g, '').trim());
            return cleanTeams.includes(teamObj.name) || cleanTeams.includes(teamObj.id);
          });

          if (hasActiveMembers) {
            toast.warning("Cannot delete this team because active staff members belong to it!");
            return;
          }
        }
      }

    } catch (err: any) {
      toast.error(`Validation process failed: ${err.message}`);
      return;
    }

    showConfirm({
      title: "Confirm Permanent Deletion",
      message: `Are you sure you want to permanently delete this item from the dymtask system? This action cannot be undone.`,
      confirmText: "Permanently Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        const tableName = activeTab.toLowerCase();
        try {
          const { error } = await supabase.from(tableName).delete().eq('id', id);
          if (error) throw error;
          await logger.log('DELETE_MASTER_DATA', `Deleted item from ${tableName}`, { id });
          toast.success("Data deleted successfully!");
          fetchData();
        } catch (error: any) {
          toast.error(`Error deleting: ${error.message}`);
        }
      }
    });
  };

  const handleToggleActive = async (item: any) => {
    const tableName = activeTab.toLowerCase();

    if (activeTab === 'USERS' && isAdmin) {
      toast.error("You do not have permission to perform this action!");
      return;
    }

    if (activeTab === 'USERS') {
      const nextStatus = item.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      
      if (item.role?.toString().toLowerCase().trim() === 'master' && nextStatus === 'INACTIVE') {
        toast.warning('Cannot deactivate the Master account.');
        return;
      }

      setUsers(prev => prev.map(u => u.id === item.id ? { ...u, status: nextStatus } : u));
      try {
        const { error } = await supabase
          .from('users')
          .update({ status: nextStatus })
          .eq('id', item.id);
        if (error) throw error;
        await logger.log('TOGGLE_ACTIVE', `Toggled user status to ${nextStatus} for ID: ${item.id}`);
        toast.success(`Successfully updated active status!`);
        useAppStore.getState().fetchMetadata(true);
      } catch (err: any) {
        setUsers(prev => prev.map(u => u.id === item.id ? { ...u, status: item.status } : u));
        toast.error(`Error toggling status: ${err.message}`);
      }
      return;
    }

    const nextActive = !item.is_active;

    if (activeTab === 'PROJECTS') {
      setProjects(prev => prev.map(p => p.id === item.id ? { ...p, is_active: nextActive } : p));
    } else if (activeTab === 'TAGS') {
      setTags(prev => prev.map(t => t.id === item.id ? { ...t, is_active: nextActive } : t));
    } else if (activeTab === 'TEAMS') {
      setTeams(prev => prev.map(t => t.id === item.id ? { ...t, is_active: nextActive } : t));
    }

    try {
      const { error } = await supabase
        .from(tableName)
        .update({ is_active: nextActive })
        .eq('id', item.id);

      if (error) throw error;

      await logger.log('TOGGLE_ACTIVE', `Toggled is_active to ${nextActive} in ${tableName} for ID: ${item.id}`);
      toast.success(`Active status updated!`);
      useAppStore.getState().fetchMetadata(true);
    } catch (error: any) {
      if (activeTab === 'PROJECTS') {
        setProjects(prev => prev.map(p => p.id === item.id ? { ...p, is_active: !nextActive } : p));
      } else if (activeTab === 'TAGS') {
        setTags(prev => prev.map(t => t.id === item.id ? { ...t, is_active: !nextActive } : t));
      } else if (activeTab === 'TEAMS') {
        setTeams(prev => prev.map(t => t.id === item.id ? { ...t, is_active: !nextActive } : t));
      }
      toast.error(`Error toggling active status: ${error.message}`);
    }
  };

  const rawTabs = [
    { id: 'USERS', label: 'Users', icon: Users },
    { id: 'PROJECTS', label: 'Projects', icon: FolderKanban },
    { id: 'TEAMS', label: 'Teams', icon: ShieldCheck },
    { id: 'TAGS', label: 'Tags', icon: TagIcon },
  ];

  const visibleTabs = rawTabs;

  const getSortedUsers = (users: any[]) => {
    const roleOrder: Record<string, number> = { 'master': 0, 'admin': 1, 'user': 2 };
    
    return [...users].sort((a, b) => {
      // 1. Status (Rightmost)
      const statusA = (a.status || 'ACTIVE').toUpperCase();
      const statusB = (b.status || 'ACTIVE').toUpperCase();
      if (statusA !== statusB) return statusA.localeCompare(statusB); // ACTIVE < INACTIVE

      // 2. Role
      const roleA = roleOrder[(a.role || 'user').toLowerCase()] ?? 3;
      const roleB = roleOrder[(b.role || 'user').toLowerCase()] ?? 3;
      if (roleA !== roleB) return roleA - roleB;

      // 3. Teams
      const teamsA = (Array.isArray(a.team_ids) ? a.team_ids : []).join(',');
      const teamsB = (Array.isArray(b.team_ids) ? b.team_ids : []).join(',');
      if (teamsA !== teamsB) return teamsA.localeCompare(teamsB);

      // 4. Name / Email (Leftmost)
      const nameA = (a.name || a.email || '').toLowerCase();
      const nameB = (b.name || b.email || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  };

  const getSortedList = (list: any[]) => {
    return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };

  const filteredUsers = users.filter(user => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return true;
    return (
      (user.name || '').toLowerCase().includes(term) ||
      (user.email || '').toLowerCase().includes(term)
    );
  });

  const filteredProjects = projects.filter(item => {
    const term = searchQuery.trim().toLowerCase();
    return (item.name || '').toLowerCase().includes(term);
  });

  const filteredTeams = teams.filter(item => {
    const term = searchQuery.trim().toLowerCase();
    return (item.name || '').toLowerCase().includes(term);
  });

  const filteredTags = tags.filter(item => {
    const term = searchQuery.trim().toLowerCase();
    return (item.name || '').toLowerCase().includes(term);
  });

  const getSortedItemsForActiveTab = (): any[] => {
    switch (activeTab) {
      case 'USERS':
        return getSortedUsers(filteredUsers);
      case 'PROJECTS':
        return getSortedList(filteredProjects);
      case 'TEAMS':
        return getSortedList(filteredTeams);
      case 'TAGS':
        return getSortedList(filteredTags);
      default:
        return [];
    }
  };

  const sortedActiveItems = getSortedItemsForActiveTab();
  const totalItemsCount = sortedActiveItems.length;
  const totalPagesCount = Math.ceil(totalItemsCount / ITEMS_PER_PAGE) || 1;
  const activeCurrentPage = Math.min(Math.max(1, currentPage), totalPagesCount);
  const startIndex = (activeCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = sortedActiveItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const emptyRowsCount = ITEMS_PER_PAGE - paginatedItems.length;

  const getPaginationItems = () => {
    const pages = [];
    if (totalPagesCount <= 7) {
      for (let i = 1; i <= totalPagesCount; i++) pages.push(i);
    } else {
      if (activeCurrentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPagesCount);
      } else if (activeCurrentPage >= totalPagesCount - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPagesCount - 4; i <= totalPagesCount; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        pages.push(activeCurrentPage - 1);
        pages.push(activeCurrentPage);
        pages.push(activeCurrentPage + 1);
        pages.push('...');
        pages.push(totalPagesCount);
      }
    }
    return pages;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white overflow-x-auto">
      {/* Header Bar */}
      <div className="px-6 h-[54px] border-b border-slate-100 bg-white shrink-0 flex items-center justify-between gap-4 flex-nowrap overflow-visible relative z-[40] min-w-max w-full select-none py-0">
        <div className="flex items-center gap-4 shrink-0 flex-nowrap">
          <div className="flex items-center bg-slate-100/80 p-0.5 rounded-md gap-0.5 border border-slate-200/50">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as TabType);
                  setSearchQuery('');
                }}
                className={cn(
                  "flex items-center justify-center h-8 w-28 rounded-md text-sm font-medium transition-all shrink-0",
                  activeTab === tab.id
                    ? "bg-white text-slate-800 shadow-sm border border-slate-200/80 font-semibold"
                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                )}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-nowrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input 
              type="text" 
              placeholder={
                activeTab === 'USERS' ? "Search by name, email..." :
                activeTab === 'PROJECTS' ? "Search by project..." :
                activeTab === 'TEAMS' ? "Search by team..." :
                activeTab === 'TAGS' ? "Search by tag..." :
                "Search..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 bg-white border border-slate-200 rounded-md text-sm w-52 h-8 focus:outline-none focus:border-slate-400 font-sans"
            />
          </div>
          {!(activeTab === 'USERS' && isAdmin) && (
            <button 
              type="button"
              onClick={handleAdd}
              className="flex items-center gap-1.5 h-8 px-3 bg-indigo-600 hover:bg-indigo-700 hover:ring-2 hover:ring-indigo-600/10 hover:border-indigo-600 text-white rounded-md text-sm font-medium select-none cursor-pointer border border-transparent transition-all font-sans"
            >
              <Plus size={14} />
              <span>Add New</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <table className="w-full text-left border-collapse table-fixed min-w-[1100px]">
          <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-20">
            <tr className="h-8">
              <th className="px-6 py-1.5 w-[25%] text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Name / Email</th>
              {activeTab === 'USERS' ? (
                <>
                  <th className="px-6 py-1.5 w-[25%] text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Teams</th>
                  <th className="px-6 py-1.5 w-[15%] text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Role</th>
                  <th className="px-6 py-1.5 w-[15%] text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Status</th>
                </>
              ) : (
                <th className="px-6 py-1.5 w-[55%] text-[11px] uppercase tracking-wider font-bold text-slate-500 bg-slate-100">Date Created</th>
              )}
              <th className="px-6 py-1.5 w-[20%] text-[11px] uppercase tracking-wider font-bold text-slate-500 text-right pr-12 bg-slate-100">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y premium-divide text-xs text-slate-700">
            {activeTab === 'USERS' ? (
              totalItemsCount > 0 ? (
                <>
                  {paginatedItems.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/40 group transition-all h-[46px]">
                      <td className="px-6 py-1">
                        <div className="flex flex-col truncate">
                          <span className="font-semibold text-slate-800 truncate">{user.name}</span>
                          <span className="text-xs text-slate-400 font-medium truncate">{user.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-1">
                        <div className="flex gap-1 flex-nowrap overflow-hidden items-center">
                          {(() => {
                            const rawTeams = Array.isArray(user.team_ids) ? user.team_ids : Array.isArray(user.teams) ? user.teams : [];
                            const teams = rawTeams
                              .map((t: any) => t?.toString().replace(/[\[\]"]/g, '').trim())
                              .filter((t: string) => t && t !== "");
                            
                            if (teams.length === 0) return <span className="text-slate-400 italic text-[11px]">No team</span>;
                            
                            const showTeams = teams.slice(0, 2);
                            const remainingCount = teams.length - 2;
                            
                            return (
                              <>
                                {showTeams.map((cleanT: string) => (
                                  <span key={cleanT} className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded text-xs font-medium shrink-0">
                                    {cleanT}
                                  </span>
                                ))}
                                {remainingCount > 0 && (
                                  <span className="px-1.5 py-0.5 bg-slate-200 border border-slate-300 text-slate-600 rounded text-xs font-semibold shrink-0" title={teams.slice(2).join(', ')}>
                                    +{remainingCount}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-1">
                        <div className="flex items-center gap-1.5 select-none font-sans">
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            user.role?.toString().toLowerCase() === 'master' ? "bg-rose-500" :
                            user.role?.toString().toLowerCase() === 'admin' ? "bg-indigo-500" : 
                            "bg-slate-400"
                          )} />
                          <span className="text-xs text-slate-600 font-medium">
                            {user.role?.toString().toLowerCase() === 'master' ? 'Master' :
                             user.role?.toString().toLowerCase() === 'admin' ? 'Admin' : 'User'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-1">
                        <div className="flex items-center gap-1.5 select-none font-sans">
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            user.status === 'ACTIVE' ? "bg-emerald-500" : "bg-slate-400"
                          )} />
                          <span className="text-xs text-slate-600 font-medium">
                            {user.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-1 text-right pr-12">
                        <div className="flex items-center justify-end gap-3 font-sans">
                          {isAdmin ? (
                            <span className="text-slate-400 text-xs italic font-medium font-sans">No Permissions</span>
                          ) : (
                            <>
                              <button 
                                onClick={() => handleToggleActive(user)}
                                className={cn(
                                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
                                  user.status === 'ACTIVE' ? "bg-emerald-500" : "bg-slate-200"
                                )}
                                title={user.status === 'ACTIVE' ? "Click to deactivate" : "Click to activate"}
                              >
                                <span
                                  className={cn(
                                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-150 ease-in-out",
                                    user.status === 'ACTIVE' ? "translate-x-4" : "translate-x-0"
                                  )}
                                />
                              </button>
                              <button onClick={() => handleEdit(user)} className="text-slate-400 hover:text-indigo-600 transition-all"><Edit2 size={13} /></button>
                              <button onClick={() => handleDelete(user.id, user.email)} className="text-slate-300 hover:text-rose-600 transition-all"><Trash2 size={13} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {emptyRowsCount > 0 && Array.from({ length: emptyRowsCount }).map((_, idx) => (
                    <tr key={`empty-user-${idx}`} className="h-[46px]">
                      <td colSpan={5} className="px-6 py-1">&nbsp;</td>
                    </tr>
                  ))}
                </>
              ) : (
                <tr>
                  <td colSpan={5} className="py-24 text-center">
                    <div className="flex flex-col items-center justify-center text-center font-sans">
                      <div className="p-4 bg-slate-50 rounded-full mb-3 text-slate-300 inline-block mx-auto">
                        <AlertCircle size={36} />
                      </div>
                      <h4 className="text-slate-800 font-bold text-sm">No Users Available</h4>
                      <p className="text-slate-400 text-xs mt-1 max-w-xs leading-relaxed mx-auto">
                        No users found matching your filter criteria.
                      </p>
                    </div>
                  </td>
                </tr>
              )
            ) : (
              totalItemsCount > 0 ? (
                <>
                  {paginatedItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/40 group transition-all h-[46px]">
                      <td className="px-6 py-1 font-semibold text-slate-800 truncate">{item.name}</td>
                      <td className="px-6 py-1 text-slate-400 font-medium text-xs">{(() => { const d = new Date(item.created_at); if (isNaN(d.getTime())) return ''; const day = String(d.getDate()).padStart(2, '0'); const month = String(d.getMonth() + 1).padStart(2, '0'); const year = d.getFullYear(); return `${day}/${month}/${year}`; })()}</td>
                      
                      <td className="px-6 py-1 text-right pr-12">
                        <div className="flex items-center justify-end gap-3 font-sans">
                          <button 
                            onClick={() => handleToggleActive(item)}
                            className={cn(
                              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
                              item.is_active !== false ? "bg-emerald-500" : "bg-slate-200"
                            )}
                            title={item.is_active !== false ? "Click to deactivate" : "Click to activate"}
                          >
                            <span
                              className={cn(
                                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-150 ease-in-out",
                                item.is_active !== false ? "translate-x-4" : "translate-x-0"
                              )}
                            />
                          </button>
                          <button onClick={() => handleEdit(item)} className="text-slate-400 hover:text-indigo-600 transition-all"><Edit2 size={13} /></button>
                          <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-rose-600 transition-all"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {emptyRowsCount > 0 && Array.from({ length: emptyRowsCount }).map((_, idx) => (
                    <tr key={`empty-item-${idx}`} className="h-[46px]">
                      <td colSpan={3} className="px-6 py-1">&nbsp;</td>
                    </tr>
                  ))}
                </>
              ) : (
                <tr>
                  <td colSpan={3} className="py-24 text-center">
                    <div className="flex flex-col items-center justify-center text-center font-sans">
                      <div className="p-4 bg-slate-50 rounded-full mb-3 text-slate-300 inline-block mx-auto">
                        <AlertCircle size={36} />
                      </div>
                      <h4 className="text-slate-800 font-bold text-sm">No Records Available</h4>
                      <p className="text-slate-400 text-xs mt-1 max-w-xs leading-relaxed mx-auto">
                        No records found matching category {activeTab.toLowerCase()}.
                      </p>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      <div className="px-6 h-8 flex items-center justify-between border-t border-slate-100 bg-white shrink-0 selection:bg-none font-sans py-0">
        <span className="text-[11px] font-medium text-slate-400 font-mono">
          Total: {totalItemsCount} records
        </span>
        <div className="flex items-center justify-center gap-1 select-none">
          <button 
            id="btn-settings-prev-page"
            disabled={activeCurrentPage <= 1} 
            onClick={() => setCurrentPage(activeCurrentPage - 1)}
            className="w-6 h-6 flex items-center justify-center text-slate-400 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all cursor-pointer"
          >
            <ChevronLeft size={12} />
          </button>
          <div className="flex gap-1 mx-2">
            {getPaginationItems().map((item, idx) => (
              <button
                key={idx}
                id={typeof item === 'number' ? `btn-settings-page-${item}` : `btn-settings-page-ellipsis-${idx}`}
                onClick={() => typeof item === 'number' && setCurrentPage(item)}
                disabled={typeof item !== 'number'}
                className={cn(
                  "w-6 h-6 flex items-center justify-center rounded-md text-[11px] font-bold transition-all",
                  activeCurrentPage === item
                    ? "bg-indigo-600 text-white shadow-sm cursor-default"
                    : typeof item === 'number'
                      ? "text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200 cursor-pointer"
                      : "text-slate-300 cursor-default"
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <button 
            id="btn-settings-next-page"
            disabled={activeCurrentPage >= totalPagesCount} 
            onClick={() => setCurrentPage(activeCurrentPage + 1)}
            className="w-6 h-6 flex items-center justify-center text-slate-400 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-white transition-all cursor-pointer"
          >
            <ChevronRight size={12} />
          </button>
        </div>
        <div className="w-20 hidden md:block"></div>
      </div>
 
      {/* Modals */}
      <MasterDataModal
        isOpen={isMasterModalOpen}
        onClose={() => setIsMasterModalOpen(false)}
        onSave={handleSaveMasterData}
        initialData={editingItem}
        title={activeTab !== 'USERS' ? activeTab.slice(0, -1) : ''}
      />

      <UserEditModal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        onSave={handleSaveUser}
        user={editingItem}
        availableTeams={teams}
      />

      <UserCreateModal
        isOpen={isUserCreateModalOpen}
        onClose={() => setIsUserCreateModalOpen(false)}
        onSave={handleCreateUser}
        availableTeams={teams}
      />
    </div>
  );
}
