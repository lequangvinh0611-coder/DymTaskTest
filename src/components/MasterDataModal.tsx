import React, { useState, useEffect, useRef } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';

const removeEmojisAndIcons = (str: string): string => {
  return str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F170}-\u{1F251}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu, '');
};

interface MasterDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  initialData?: any;
  title: string;
}

export default function MasterDataModal({ isOpen, onClose, onSave, initialData, title }: MasterDataModalProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const backdropClickedRef = useRef(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
    } else {
      setName('');
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      const normalizedName = name.toString().toUpperCase().trim();
      await onSave(normalizedName);
      onClose();
    } catch (error) {
      console.error('Save error:', error);
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
      <div className="bg-white rounded-md shadow-2xl border border-slate-100 w-full max-w-sm overflow-hidden transform animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-slate-150 flex items-center justify-between bg-slate-50">
          <h3 className="text-xs font-semibold text-slate-800">
            {initialData ? 'Edit' : 'Add new'} {title.toLowerCase()}
          </h3>
          <button 
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                {title} name
              </label>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(removeEmojisAndIcons(e.target.value))}
                placeholder={`Enter ${title.toLowerCase()} name...`}
                className="w-full h-8 px-3 bg-white border border-slate-200 rounded-md focus:border-indigo-500 outline-none transition-all font-medium text-slate-700 placeholder:text-slate-300 placeholder:font-normal text-xs shadow-sm"
                required
              />
            </div>
            
            <div className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-md border border-slate-150">
              <AlertCircle className="text-slate-400 shrink-0 mt-0.5" size={14} />
              <p className="text-xs text-slate-500 leading-normal">
                Note: System will automatically normalize this entry to uppercase and trimmed format for data consistency.
              </p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-8 bg-slate-100 text-slate-700 rounded-md text-xs font-semibold hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 h-8 bg-indigo-600 text-white rounded-md text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all flex items-center justify-center gap-1.5"
            >
              <Save size={13} />
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
