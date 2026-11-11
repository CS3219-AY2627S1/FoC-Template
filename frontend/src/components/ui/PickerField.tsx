/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated a drop-down whose options can be colour coded, for the
 *        delivery location picker.
 * Reviewed by Ngooi Jun Sen.
 *
 * A native <select> cannot colour its options on phones, so this draws its
 * own list. It follows the WAI-ARIA collapsible listbox pattern: a button
 * opens a listbox that takes focus, arrows move, Enter or Space picks,
 * Escape closes, and typing a letter jumps to the next option starting
 * with it.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Field } from './Field';
import { Icon } from './Icon';
import styles from './PickerField.module.css';

/** Accent and info match the app's two highlight colours; "add" draws a plus. */
export type PickerTone = 'accent' | 'info' | 'add';

export interface PickerOption {
  value: string;
  label: string;
  /** A second, quieter line under the label. */
  detail?: string | null;
  tone?: PickerTone;
  /** Options sharing a group are listed together under it, in first-seen order. */
  group?: string;
}

interface PickerFieldProps {
  label: string;
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  error?: ReactNode;
}

/** Ungrouped options first, then each group, keeping the order they came in. */
function arrange(options: PickerOption[]) {
  const loose: PickerOption[] = [];
  const groups = new Map<string, PickerOption[]>();
  for (const option of options) {
    if (option.group === undefined) loose.push(option);
    else groups.set(option.group, [...(groups.get(option.group) ?? []), option]);
  }
  return { loose, groups: [...groups], flat: [...loose, ...[...groups.values()].flat()] };
}

/** A heading takes its options' colour only when they all share one. */
function groupTone(members: PickerOption[]): 'accent' | 'info' | undefined {
  const tone = members[0]?.tone;
  return (tone === 'accent' || tone === 'info') && members.every((member) => member.tone === tone)
    ? tone
    : undefined;
}

/** One fixed-width slot per marker, so every label starts at the same place. */
function Swatch({ tone }: { tone: PickerTone | undefined }) {
  const kind = tone === 'add' ? styles.add : tone === 'info' ? styles.info : styles.accent;
  return (
    <span className={styles.slot} aria-hidden="true">
      <span className={`${styles.swatch} ${kind}`} />
    </span>
  );
}

export function PickerField({ label, options, value, onChange, placeholder, hint, error }: PickerFieldProps) {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;

  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const { loose, groups, flat } = arrange(options);
  const selected = flat.find((option) => option.value === value);

  function show() {
    const index = flat.findIndex((option) => option.value === value);
    setActive(index < 0 ? 0 : index);
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  function pick(index: number) {
    const option = flat[index];
    if (option !== undefined) onChange(option.value);
    close(true);
  }

  // The list takes focus when it opens, so arrow keys reach it.
  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [id, open, active]);

  // A press anywhere else closes it, as a native select would.
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function onButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      show();
    }
  }

  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const last = flat.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => setActive((index) => Math.min(index + 1, last)),
      ArrowUp: () => setActive((index) => Math.max(index - 1, 0)),
      Home: () => setActive(0),
      End: () => setActive(last),
      PageDown: () => setActive((index) => Math.min(index + 8, last)),
      PageUp: () => setActive((index) => Math.max(index - 8, 0)),
      Enter: () => pick(active),
      ' ': () => pick(active),
      Escape: () => close(true),
    };
    const action = keys[event.key];
    if (action !== undefined) {
      event.preventDefault();
      action();
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    // Type-ahead: the next option, after the current one, starting with the letter.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const letter = event.key.toLowerCase();
      for (let step = 1; step <= flat.length; step += 1) {
        const index = (active + step) % flat.length;
        if (flat[index]?.label.toLowerCase().startsWith(letter)) {
          setActive(index);
          break;
        }
      }
    }
  }

  function renderOption(option: PickerOption) {
    const index = flat.indexOf(option);
    return (
      <li
        key={option.value}
        id={optionId(index)}
        role="option"
        aria-selected={option.value === value}
        className={[
          styles.option,
          index === active ? styles.active : '',
          option.value === value ? styles.selected : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onPointerMove={() => setActive(index)}
        onClick={() => pick(index)}
      >
        <Swatch tone={option.tone} />
        <span className={styles.optionText}>
          <span className={styles.optionLabel}>{option.label}</span>
          {option.detail ? <span className={styles.optionDetail}>{option.detail}</span> : null}
        </span>
        {option.value === value ? (
          <span className={styles.check} aria-hidden="true">
            <Icon name="check" size={16} />
          </span>
        ) : null}
      </li>
    );
  }

  return (
    <Field label={label} htmlFor={id} hint={hint} error={error}>
      <div className={styles.root} ref={root}>
        <button
          ref={button}
          id={id}
          type="button"
          className={[styles.control, error ? styles.invalid : ''].filter(Boolean).join(' ')}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-invalid={error ? true : undefined}
          onClick={() => (open ? close(false) : show())}
          onKeyDown={onButtonKeyDown}
        >
          {selected ? (
            <>
              <Swatch tone={selected.tone} />
              <span className={styles.value}>{selected.label}</span>
            </>
          ) : (
            <span className={styles.placeholder}>{placeholder ?? 'Choose one'}</span>
          )}
          <span className={styles.chevron} aria-hidden="true">
            <Icon name="chevronDown" size={18} />
          </span>
        </button>

        {open ? (
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-label={label}
            aria-activedescendant={flat.length > 0 ? optionId(active) : undefined}
            className={styles.list}
            onKeyDown={onListKeyDown}
            onBlur={(event) => {
              if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
            }}
          >
            {loose.map(renderOption)}
            {groups.map(([group, members]) => (
              <li key={group} role="presentation">
                <p
                  id={`${id}-group-${group}`}
                  className={[styles.groupLabel, styles[groupTone(members) ?? 'mixed']].filter(Boolean).join(' ')}
                >
                  {group}
                </p>
                <ul role="group" aria-labelledby={`${id}-group-${group}`} className={styles.group}>
                  {members.map(renderOption)}
                </ul>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Field>
  );
}
