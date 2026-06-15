import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface FilterOption {
  value: string;
  label: string;
}

interface MultiTeamFilterSelectProps {
  value: string; // Comma-separated list of selected teams, e.g. "Team A,Team B" or "" for All Teams
  onChange: (value: string) => void;
  defaultOptionLabel: string;
  options: FilterOption[];
  className?: string;
}

export const MultiTeamFilterSelect: React.FC<MultiTeamFilterSelectProps> = ({
  value,
  onChange,
  defaultOptionLabel,
  options,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse comma-separated string into a list of selected values
  const selectedValues = useMemo(() => {
    return value ? value.split(',').filter(Boolean) : [];
  }, [value]);

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

  // Compute label text to display
  const dispText = useMemo(() => {
    if (selectedValues.length === 0) {
      return defaultOptionLabel;
    }
    if (selectedValues.length === 1) {
      return selectedValues[0];
    }
    return `${selectedValues[0]} +${selectedValues.length - 1}`;
  }, [selectedValues, defaultOptionLabel]);

  // Handle choice toggler (click 1 to select, click 2 to deselect)
  const toggleOption = (optVal: string) => {
    let nextValues: string[];
    if (selectedValues.includes(optVal)) {
      // Deselecting
      nextValues = selectedValues.filter(v => v !== optVal);
    } else {
      // Selecting
      nextValues = [...selectedValues, optVal];
    }
    onChange(nextValues.join(','));
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div className={cn("relative inline-block w-full text-left", className)} ref={containerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        title={selectedValues.join(', ') || defaultOptionLabel}
        className="flex items-center justify-between w-full px-3.5 bg-white border border-slate-200 rounded-md text-xs font-medium h-8 text-slate-600 focus:border-slate-400 focus:outline-none cursor-pointer transition-colors hover:bg-slate-50/50 shadow-sm"
      >
        <span className="truncate pr-1">
          {dispText}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedValues.length > 0 && (
            <span 
              onClick={clearAll}
              className="p-0.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              title="Clear all selected"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ml-0.5", isOpen && "rotate-180")} />
        </div>
      </div>

      {isOpen && (
        <div className="absolute right-0 mt-1 z-[100] min-w-[200px] max-w-[280px] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          
          {/* Options List */}
          <div className="max-h-60 overflow-y-auto p-1 text-xs select-none">
            {/* Default Option (Clear All / All Teams selection) */}
            <div
              onClick={() => {
                onChange("");
              }}
              className={cn(
                "flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors font-medium mb-1",
                selectedValues.length === 0 ? "bg-slate-100 text-slate-800" : "hover:bg-slate-50 text-slate-500"
              )}
            >
              <span className="truncate">{defaultOptionLabel}</span>
              {selectedValues.length === 0 && <Check className="w-3.5 h-3.5 text-slate-600" />}
            </div>

            <div className="h-[1px] bg-slate-100 my-0.5" />

            {options.map((option) => {
              const isSelected = selectedValues.includes(option.value);
              return (
                <div
                  key={option.value}
                  title={option.label}
                  onClick={() => toggleOption(option.value)}
                  className={cn(
                    "flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors mt-0.5",
                    isSelected 
                      ? "bg-indigo-50 text-indigo-700 font-medium" 
                      : "hover:bg-slate-50 text-slate-600"
                  )}
                >
                  <span className="truncate pr-2">{option.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
