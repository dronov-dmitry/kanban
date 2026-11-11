import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type KeyboardEvent, useEffect, useState } from 'react';
import { get } from '../lib/api';
import { cn } from '../lib/utils';

interface UserSuggestion {
  email: string;
  display_name: string;
}

export function EmailInput({
  id,
  value,
  onChange,
  multiple = false,
  placeholder,
  className,
  style,
  onKeyDown,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Allow a comma-separated list and complete only the last e-mail. */
  multiple?: boolean;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const current = multiple ? (value.split(',').pop() ?? '').trim() : value.trim();
  const query = current.toLowerCase();
  const lookup = useQuery({
    queryKey: ['user-lookup', query],
    queryFn: () =>
      get<{ data: UserSuggestion[] }>(`/v1/me/user-lookup?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
  const suggestions = lookup.data?.data ?? [];
  const open = focused && query.length >= 2 && suggestions.length > 0;

  useEffect(() => {
    setActive(0);
  }, [query]);

  function apply(email: string) {
    if (multiple) {
      const separator = value.lastIndexOf(',');
      const before = separator >= 0 ? value.slice(0, separator + 1) : '';
      onChange(`${before}${before ? ' ' : ''}${email}, `);
    } else {
      onChange(email);
      setFocused(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (open) {
      const suggestion = suggestions[Math.min(active, suggestions.length - 1)];
      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        if (suggestion) apply(suggestion.email);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((index) => Math.min(index + 1, suggestions.length - 1));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === 'Escape') {
        setFocused(false);
        return;
      }
    }
    onKeyDown?.(event);
  }

  return (
    <div className="email-input" style={style}>
      <input
        id={id}
        type="email"
        autoComplete="off"
        className={className ?? 'input'}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onKeyDown={handleKeyDown}
      />
      {open ? (
        <div className="email-suggest" role="listbox">
          {suggestions.map((row, index) => (
            <button
              key={row.email}
              type="button"
              role="option"
              aria-selected={index === Math.min(active, suggestions.length - 1)}
              className={cn(
                'email-suggest-item',
                index === Math.min(active, suggestions.length - 1) && 'active',
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                apply(row.email);
              }}
            >
              <span className="strong small">{row.display_name}</span>
              <span className="caption subtle">{row.email}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
