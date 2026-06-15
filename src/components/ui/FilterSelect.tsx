import React from 'react';

interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  defaultOptionLabel: string;
  options: FilterOption[];
  className?: string;
}

export const FilterSelect: React.FC<FilterSelectProps> = ({
  value,
  onChange,
  defaultOptionLabel,
  options,
  className
}) => {
  const selectedLabel = options.find(o => o.value === value)?.label || defaultOptionLabel;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title={selectedLabel}
      className={`px-3.5 bg-white border border-slate-200 rounded-md text-xs font-medium h-8 min-w-[130px] text-slate-600 focus:border-slate-400 focus:outline-none cursor-pointer transition-colors hover:bg-slate-50/50 shadow-sm ${className || ''}`}
    >
      <option value="" title={defaultOptionLabel}>{defaultOptionLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value} title={option.label}>
          {option.label}
        </option>
      ))}
    </select>
  );
};
