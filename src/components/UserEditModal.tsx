import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Shield, Users, Power } from 'lucide-react';

const removeEmojisAndIcons = (str: string): string => {
  return str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F170}-\u{1F251}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '');
};

interface UserEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (userId: string, data: { name: string; role: string; status: string; teams: string[] }) => Promise<void>;
  user: any;
  availableTeams: any[];
}

export default function UserEditModal({ isOpen, onClose, onSave, user, availableTeams }: UserEditModalProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('USER');
  const [status, setStatus] = useState('ACTIVE');
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const backdropClickedRef = useRef(false);

  useEffect(() => {
    if (user && isOpen) {
      setName(user.name || '');
      setRole(user.role?.toString().toUpperCase().trim() || 'USER');
      setStatus(user.status?.toString().toUpperCase().trim() || 'ACTIVE');
      const teams = user.team_ids || user.teams;
      setSelectedTeams(Array.isArray(teams) ? teams.map((t: any) => t.toString().toUpperCase().trim()) : []);
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  const toggleTeam = (teamName: string) => {
    const normalized = teamName.toString().toUpperCase().trim();
    setSelectedTeams(prev => 
      prev.includes(normalized) 
        ? prev.filter(t => t !== normalized) 
        : [...prev, normalized]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        role: role.toString().toLowerCase().trim(),
        status: status.toString().toUpperCase().trim(),
        teams: selectedTeams.map(t => t.toString().toUpperCase().trim())
      };
      await onSave(user.id, payload);
      onClose();
    } catch (error) {
      console.error('[UserEditModal] Save error:', error);
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div 
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px] animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-md shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-xs font-semibold text-slate-800">Edit Staff Details</h3>
            <p className="text-xs text-slate-400 font-normal mt-0.5">{user.email?.toString().toLowerCase().trim()}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="space-y-4">
            {/* Name Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Full Name</label>
              <input
                type="text"
                placeholder="Enter full name..."
                value={name}
                onChange={(e) => setName(removeEmojisAndIcons(e.target.value))}
                className="w-full h-8 px-2.5 bg-white border border-slate-250 rounded text-xs text-slate-700 focus:outline-none focus:border-indigo-550 focus:ring-1 focus:ring-indigo-100"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Role selection */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <Shield size={13} />
                  <span>System Role</span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {['MASTER', 'ADMIN', 'USER'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`flex items-center justify-between px-3 h-8 rounded-md border transition-all text-xs font-medium ${
                        role === r 
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-sm' 
                          : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'
                      }`}
                    >
                      <span>{r === 'MASTER' ? 'Master' : r === 'ADMIN' ? 'Admin' : 'User'}</span>
                      {role === r && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-in zoom-in-100" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status selection */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <Power size={13} />
                  <span>Status</span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {['ACTIVE', 'INACTIVE'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`flex items-center justify-between px-3 h-8 rounded-md border transition-all text-xs font-medium ${
                        status === s 
                          ? (s === 'ACTIVE' ? 'border-emerald-600 bg-emerald-50/50 text-emerald-700' : 'border-slate-600 bg-slate-50 text-slate-750')
                          : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      <span>{s === 'ACTIVE' ? 'Active' : 'Inactive'}</span>
                      {status === s && <div className={`w-1.5 h-1.5 rounded-full ${s === 'ACTIVE' ? 'bg-emerald-600' : 'bg-slate-400'} animate-in zoom-in-100`} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Team selection (Full width) */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Users size={13} />
                <span>Departments</span>
              </div>
              <div className="flex gap-1.5 flex-wrap min-h-[50px] p-2.5 bg-slate-50 border border-slate-100 rounded-md">
                {availableTeams.length > 0 ? (
                  availableTeams.map((team) => {
                    const normalized = team.name?.toString().toUpperCase().trim();
                    const isSelected = selectedTeams.includes(normalized);
                    return (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => toggleTeam(normalized)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-all border ${
                          isSelected 
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' 
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                        }`}
                      >
                        {normalized}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-400 italic font-medium w-full text-center py-2">No teams created in Master Data yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-8 bg-slate-100 text-slate-700 rounded-md text-xs font-semibold hover:bg-slate-200 transition-all border border-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-8 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all flex items-center justify-center gap-1.5"
            >
              <Save size={13} />
              {saving ? 'Updating...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
