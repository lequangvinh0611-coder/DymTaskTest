import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FilterOption {
  value: string;
  label: string;
}

interface SearchableFilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  defaultOptionLabel: string;
  options: FilterOption[];
  className?: string;
  onOpenChange?: (open: boolean) => void;
  placement?: 'auto' | 'top' | 'bottom';
}

export const SearchableFilterSelect: React.FC<SearchableFilterSelectProps> = ({
  value,
  onChange,
  defaultOptionLabel,
  options,
  className,
  onOpenChange,
  placement = 'auto'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openUpward, setOpenUpward] = useState(placement === 'top');
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close the dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Notify parent component of any open/closed state modifications
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  // Determine ideal position (upward/downward) whenever dropdown opens
  useEffect(() => {
    if (placement === 'top') {
      setOpenUpward(true);
    } else if (placement === 'bottom') {
      setOpenUpward(false);
    } else if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const threshold = 280; // Height of dropdown with search and options list
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // If bottom space is constrained and we have room scroll/space above, go upward
      setOpenUpward(spaceBelow < threshold && spaceAbove > spaceBelow);
    }
  }, [isOpen, placement]);

  // Find currently selected option
  const selectedOption = options.find(o => o.value === value);

  // Clean filter by matching search input
  const filteredOptions = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return options;
    return options.filter(o => 
      o.label.toLowerCase().includes(query) || 
      o.value.toLowerCase().includes(query)
    );
  }, [options, search]);

  // Reset search when dropdown closes or opens
  useEffect(() => {
    if (!isOpen) {
      setSearch("");
    }
  }, [isOpen]);

  return (
    <div className={cn("relative inline-block w-full text-left", className)} ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={selectedOption ? selectedOption.label : defaultOptionLabel}
        className="flex items-center justify-between w-full px-3.5 bg-white border border-slate-200 rounded-md text-xs font-medium h-8 text-slate-600 focus:border-slate-400 focus:outline-none cursor-pointer transition-colors hover:bg-slate-50/50 shadow-sm"
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : defaultOptionLabel}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ml-1.5", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className={cn(
          "absolute left-0 z-[100] min-w-full w-max max-w-[450px] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100",
          openUpward ? "bottom-full mb-1.5 origin-bottom" : "top-full mt-1 origin-top"
        )}>
          {/* Search bar inside dropdown */}
          <div className="p-1 px-2 border-b border-slate-100 bg-slate-50">
            <div className="relative flex items-center">
              <Search className="absolute left-2 w-3 h-3 text-slate-400" />
              <input
                autoFocus
                type="text"
                className="w-full pl-6 pr-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-none focus:border-slate-400 font-medium text-slate-700"
                placeholder="Search assignee..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto p-1 text-xs">
            {/* Default option (e.g. All Assignees) */}
            <div
              onClick={() => {
                onChange("");
                setIsOpen(false);
              }}
              title={defaultOptionLabel}
              className={cn(
                "flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors font-medium",
                value === "" ? "bg-slate-100 text-slate-800" : "hover:bg-slate-50 text-slate-500"
              )}
            >
              <span className="truncate">{defaultOptionLabel}</span>
              {value === "" && <Check className="w-3.5 h-3.5 text-slate-600" />}
            </div>

            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  title={option.label}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors",
                    value === option.value ? "bg-indigo-50 text-indigo-700 font-medium" : "hover:bg-slate-50 text-slate-600"
                  )}
                >
                  <span className="truncate">{option.label}</span>
                  {value === option.value && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                </div>
              ))
            ) : (
              <div className="px-2.5 py-1.5 text-slate-400 italic text-center">No results found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
