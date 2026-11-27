'use client';

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface ScrollableSelectProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options?: SelectOption[];
  children?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  className?: string;
  buttonClassName?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
}

function extractOptions(children: ReactNode): SelectOption[] {
  const result: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === 'option') {
      const props = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode };
      const label =
        typeof props.children === 'string' || typeof props.children === 'number'
          ? String(props.children)
          : Array.isArray(props.children)
            ? props.children.map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : '')).join('')
            : '';
      const val = props.value !== undefined ? String(props.value) : label;
      result.push({ value: val, label: label.trim() || val, disabled: Boolean(props.disabled) });
    } else if (child.type === 'optgroup') {
      const props = child.props as { children?: ReactNode };
      result.push(...extractOptions(props.children));
    }
  });
  return result;
}

/**
 * Reusable, accessible, scrollable dropdown component replacing native OS selection popups.
 * Opens below the trigger when space permits, or flips above when near the bottom of the viewport.
 */
export function ScrollableSelect({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  options: propOptions,
  children,
  placeholder = 'Select an option…',
  disabled = false,
  required = false,
  searchable,
  className = '',
  buttonClassName = '',
  ariaLabel,
  ariaInvalid = false,
}: ScrollableSelectProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const listboxId = `${controlId}-listbox`;

  const options = useMemo(() => {
    if (propOptions && propOptions.length > 0) return propOptions;
    return extractOptions(children);
  }, [propOptions, children]);

  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string>(() => {
    if (defaultValue !== undefined) return String(defaultValue);
    return options[0]?.value ?? '';
  });

  useEffect(() => {
    if (!isControlled && defaultValue !== undefined) {
      setInternalValue(String(defaultValue));
    }
  }, [defaultValue, isControlled]);

  const currentValue = isControlled ? String(value) : internalValue;
  const selectedOption = options.find((o) => o.value === currentValue);

  const [open, setOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const showSearch = searchable ?? options.length >= 8;

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setOpenAbove(spaceBelow < 260 && spaceAbove > spaceBelow);
    }
    const idx = filteredOptions.findIndex((o) => o.value === currentValue);
    setHighlightedIndex(idx >= 0 ? idx : 0);
    if (showSearch) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [open]);

  function selectOption(opt: SelectOption) {
    if (opt.disabled) return;
    if (!isControlled) setInternalValue(opt.value);
    onValueChange?.(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(filteredOptions.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredOptions[highlightedIndex];
      if (target && !target.disabled) selectOption(target);
    }
  }

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`} onKeyDown={handleKeyDown}>
      {name ? <input type="hidden" name={name} value={currentValue} required={required} /> : null}
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`flex min-h-[44px] w-full min-w-0 items-center justify-between gap-2 rounded-control border border-line bg-white px-3 py-2 text-left text-base text-ink transition focus:border-burgundy focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:cursor-not-allowed disabled:opacity-60 md:text-sm ${buttonClassName}`}
      >
        <span className={`truncate ${selectedOption && selectedOption.value !== '' ? 'text-ink' : 'text-ink-muted'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-burgundy transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          className={`absolute left-0 right-0 z-50 w-full min-w-[200px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-gold/60 bg-cream shadow-hover ${
            openAbove ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {showSearch ? (
            <div className="border-b border-line bg-card px-2.5 py-2">
              <div className="flex items-center gap-2 rounded-control border border-line bg-white px-2.5 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  placeholder="Search options…"
                  className="w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-muted md:text-xs"
                />
              </div>
            </div>
          ) : null}

          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className="max-h-60 overflow-y-auto overscroll-contain py-1"
          >
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-ink-muted">No matching options</li>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === currentValue;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <li key={`${opt.value}-${idx}`} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => selectOption(opt)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`flex min-h-[42px] w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                        opt.disabled
                          ? 'cursor-not-allowed text-ink-muted/50'
                          : isSelected
                            ? 'bg-burgundy font-semibold text-cream'
                            : isHighlighted
                              ? 'bg-gold/20 text-burgundy'
                              : 'text-ink hover:bg-gold/15'
                      }`}
                    >
                      <span className="break-words">{opt.label}</span>
                      {isSelected ? <Check className="h-4 w-4 shrink-0 text-gold" aria-hidden /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
