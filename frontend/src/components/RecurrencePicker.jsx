/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 g (instructions.md) - the recurrence picker for scheduled errands:
 *        every day/week/month/year, each with its own sub-controls (weekly: days of the
 *        week; monthly: a date, or the Nth weekday/day/weekend day; yearly: one month plus
 *        the Nth weekday/day/weekend day), interval ("every N ..."), and an end condition (on
 *        date / after N times / never), per the stage's "Recurrence picker (iOS-style)"
 *        bullet. Yearly picks a single month (a plain Toggle, not MultiToggle): see
 *        domain/seriesRule.js's header for why BYSETPOS makes several months ambiguous.
 *        Operates purely on the picker state from domain/seriesRule.js; building and
 *        parsing RRULE text happens there, not here. No requirements, architecture, schema,
 *        or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 32 (instructions.md) - the "after N occurrences" end condition now shows the
 *        word "time"/"times" after the stepper (was screen-reader only before).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { Minus, Plus } from 'lucide-react'
import { FREQ, NTH_OPTIONS, NTH_UNITS, WEEKDAY_LABELS } from '../domain/seriesRule'

const FREQ_OPTIONS = [
  [FREQ.DAILY, 'Day'],
  [FREQ.WEEKLY, 'Week'],
  [FREQ.MONTHLY, 'Month'],
  [FREQ.YEARLY, 'Year'],
]
const FREQ_UNIT = { [FREQ.DAILY]: 'day', [FREQ.WEEKLY]: 'week', [FREQ.MONTHLY]: 'month', [FREQ.YEARLY]: 'year' }
const NTH_LABELS = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', 5: 'Fifth', '-1': 'Last' }
const NTH_UNIT_LABELS = { day: 'day', weekday: 'weekday', weekendday: 'weekend day' }
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function Toggle({ value, onChange, options, getLabel = (o) => o, ariaLabelPrefix = '' }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-btn border border-line p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          aria-label={ariaLabelPrefix ? ariaLabelPrefix + ' ' + getLabel(option) : undefined}
          onClick={() => onChange(option)}
          className={
            'h-9 rounded-[7px] px-3 text-sm font-medium transition-colors duration-150 ' +
            (value === option ? 'bg-ink text-white' : 'text-ink-70 hover:text-ink')
          }
        >
          {getLabel(option)}
        </button>
      ))}
    </div>
  )
}

function MultiToggle({ values, onChange, options, getLabel = (o) => o }) {
  const toggle = (option) => {
    const has = values.includes(option)
    const next = has ? values.filter((v) => v !== option) : [...values, option]
    // At least one choice stays selected, so the rule can never describe "never happens".
    if (next.length > 0) onChange(next)
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={values.includes(option)}
          onClick={() => toggle(option)}
          className={
            'h-9 rounded-pill border px-3 text-sm font-medium transition-colors duration-150 ' +
            (values.includes(option)
              ? 'border-ink bg-ink text-white'
              : 'border-line bg-surface text-ink-70 hover:border-ink hover:text-ink')
          }
        >
          {getLabel(option)}
        </button>
      ))}
    </div>
  )
}

function Stepper({ value, onChange, min = 1, max = 99, label }) {
  return (
    <div className="inline-flex h-10 items-center gap-3 rounded-btn border border-line px-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={'Fewer ' + label}
        className="flex h-7 w-7 items-center justify-center rounded-pill border border-line text-ink disabled:text-ink-40"
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <span className="tnum min-w-[2ch] text-center text-sm font-semibold text-ink">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={'More ' + label}
        className="flex h-7 w-7 items-center justify-center rounded-pill border border-line text-ink disabled:text-ink-40"
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

function NthUnitPicker({ nth, nthUnit, onChangeNth, onChangeUnit }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-70">On the</span>
      <select
        aria-label="Which occurrence of the month"
        value={nth}
        onChange={(e) => onChangeNth(Number(e.target.value))}
        className="h-10 rounded-btn border border-line bg-surface px-2 text-sm text-ink"
      >
        {NTH_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {NTH_LABELS[String(n)]}
          </option>
        ))}
      </select>
      <select
        aria-label="Day to repeat on"
        value={String(nthUnit)}
        onChange={(e) => {
          const raw = e.target.value
          onChangeUnit(NTH_UNITS.includes(raw) ? raw : Number(raw))
        }}
        className="h-10 rounded-btn border border-line bg-surface px-2 text-sm text-ink"
      >
        {WEEKDAY_LABELS.map((label, i) => (
          <option key={i} value={i}>
            {label}
          </option>
        ))}
        {NTH_UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {NTH_UNIT_LABELS[unit]}
          </option>
        ))}
      </select>
    </div>
  )
}

/** `value` is a seriesRule.js picker state object; `onChange` replaces it wholesale. */
export default function RecurrencePicker({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-3">
      <Toggle value={value.freq} onChange={(freq) => set({ freq })} options={FREQ_OPTIONS.map(([f]) => f)} getLabel={(f) => FREQ_OPTIONS.find(([v]) => v === f)[1]} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-70">Every</span>
        <Stepper value={value.interval} onChange={(interval) => set({ interval })} min={1} max={99} label={FREQ_UNIT[value.freq] + 's'} />
        <span className="text-sm text-ink-70">
          {FREQ_UNIT[value.freq]}
          {value.interval > 1 ? 's' : ''}
        </span>
      </div>

      {value.freq === FREQ.WEEKLY && (
        <div>
          <span className="block text-sm text-ink-70">On</span>
          <div className="mt-1.5">
            <MultiToggle
              values={value.byweekday}
              onChange={(byweekday) => set({ byweekday })}
              options={[0, 1, 2, 3, 4, 5, 6]}
              getLabel={(d) => WEEKDAY_LABELS[d]}
            />
          </div>
        </div>
      )}

      {value.freq === FREQ.MONTHLY && (
        <div className="space-y-2">
          <Toggle
            value={value.monthlyMode}
            onChange={(monthlyMode) => set({ monthlyMode })}
            options={['date', 'nth']}
            getLabel={(m) => (m === 'date' ? 'On a date' : 'On the Nth day')}
          />
          {value.monthlyMode === 'date' ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-70">On day</span>
              <Stepper value={value.bymonthday} onChange={(bymonthday) => set({ bymonthday })} min={1} max={31} label="days" />
            </div>
          ) : (
            <NthUnitPicker
              nth={value.nth}
              nthUnit={value.nthUnit}
              onChangeNth={(nth) => set({ nth })}
              onChangeUnit={(nthUnit) => set({ nthUnit })}
            />
          )}
        </div>
      )}

      {value.freq === FREQ.YEARLY && (
        <div className="space-y-2">
          <div>
            <span className="block text-sm text-ink-70">In</span>
            <div className="mt-1.5">
              <Toggle
                value={value.bymonth}
                onChange={(bymonth) => set({ bymonth })}
                options={Array.from({ length: 12 }, (_, i) => i + 1)}
                getLabel={(m) => MONTH_LABELS[m - 1]}
              />
            </div>
          </div>
          <NthUnitPicker
            nth={value.nth}
            nthUnit={value.nthUnit}
            onChangeNth={(nth) => set({ nth })}
            onChangeUnit={(nthUnit) => set({ nthUnit })}
          />
        </div>
      )}

      <div>
        <span className="block text-sm text-ink-70">Ends</span>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <Toggle
            value={value.end.type}
            onChange={(type) =>
              set({
                end:
                  type === 'onDate'
                    ? { type, date: value.end.date || new Date().toISOString().slice(0, 10) }
                    : type === 'after'
                      ? { type, count: value.end.count || 1 }
                      : { type },
            })
            }
            options={['never', 'onDate', 'after']}
            getLabel={(t) => (t === 'never' ? 'Never' : t === 'onDate' ? 'On date' : 'After')}
          />
          {value.end.type === 'onDate' && (
            <input
              type="date"
              aria-label="End date"
              value={value.end.date}
              onChange={(e) => set({ end: { type: 'onDate', date: e.target.value } })}
              className="h-10 rounded-btn border border-line bg-surface px-3 text-sm text-ink"
            />
          )}
          {value.end.type === 'after' && (
            <div className="flex items-center gap-2">
              <Stepper
                value={value.end.count}
                onChange={(count) => set({ end: { type: 'after', count } })}
                min={1}
                max={999}
                label="occurrences"
              />
              <span className="text-sm text-ink-70">{value.end.count === 1 ? 'time' : 'times'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
