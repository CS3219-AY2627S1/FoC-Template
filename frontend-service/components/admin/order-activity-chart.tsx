'use client';

import { useEffect, useRef, useState } from 'react';

import {
  ACTIVITY_LABELS,
  ACTIVITY_SERIES,
  type ActivitySeries,
  countAxis,
} from '@/lib/admin-orders';
import type { OrderActivityBucket } from '@/lib/order-service';

/**
 * Categorical slots 1–3 of the dataviz reference palette, validated as a set
 * on white (all-pairs CVD ΔE ≥ 9.2). Completed's aqua is under 3:1 contrast,
 * so the legend, the tooltip and the past-hour tiles carry the values too.
 */
export const SERIES_COLORS: Record<ActivitySeries, string> = {
  created: '#2a78d6',
  accepted: '#eb6834',
  completed: '#1baf7a',
};

const HEIGHT = 220;
const MARGIN = { top: 12, right: 16, bottom: 28, left: 32 };
/** Label every sixth hour so the axis stays readable on a phone. */
const LABEL_EVERY = 6;

const timeFormat = new Intl.DateTimeFormat('en-SG', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Singapore',
});

function formatTime(iso: string) {
  return timeFormat.format(new Date(iso));
}

/** A short line segment that keys a value to its series without coloring text. */
export function SeriesKey({ series }: { series: ActivitySeries }) {
  return (
    <span
      aria-hidden
      className='inline-block h-0.5 w-3 shrink-0 rounded-full'
      style={{ backgroundColor: SERIES_COLORS[series] }}
    />
  );
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, Math.floor(entry.contentRect.width))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

export function OrderActivityChart({
  buckets,
}: {
  buckets: OrderActivityBucket[];
}) {
  const { ref, width } = useWidth();
  const [active, setActive] = useState<number | null>(null);

  const n = buckets.length;
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const max = Math.max(
    0,
    ...buckets.flatMap((b) => ACTIVITY_SERIES.map((s) => b[s])),
  );
  const axis = countAxis(max);
  const step = n > 1 ? innerWidth / (n - 1) : 0;
  const x = (i: number) => MARGIN.left + i * step;
  const y = (value: number) =>
    MARGIN.top + innerHeight * (1 - value / axis.top);

  function indexAt(clientX: number, rect: DOMRect) {
    const offset = clientX - rect.left - MARGIN.left;
    return Math.min(n - 1, Math.max(0, Math.round(offset / (step || 1))));
  }

  if (n === 0) return null;
  const hovered = active === null ? null : buckets[active];
  const tooltipLeft =
    active === null
      ? 0
      : Math.min(Math.max(x(active) - 80, 0), Math.max(0, width - 160));

  return (
    <div className='space-y-3'>
      <ul className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600'>
        {ACTIVITY_SERIES.map((series) => (
          <li key={series} className='flex items-center gap-1.5'>
            <SeriesKey series={series} />
            {ACTIVITY_LABELS[series]}
          </li>
        ))}
      </ul>

      <div
        ref={ref}
        className='relative'
        tabIndex={0}
        role='group'
        aria-label='Orders per hour over the past 24 hours. Use the arrow keys to read each hour.'
        onFocus={() => setActive((current) => current ?? n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const delta = e.key === 'ArrowLeft' ? -1 : 1;
            setActive((current) =>
              Math.min(n - 1, Math.max(0, (current ?? n - 1) + delta)),
            );
          }
        }}
      >
        <svg
          width={width}
          height={HEIGHT}
          className='block max-w-full touch-pan-y'
          onPointerMove={(e) =>
            setActive(
              indexAt(e.clientX, e.currentTarget.getBoundingClientRect()),
            )
          }
          onPointerLeave={() => setActive(null)}
          aria-hidden
        >
          {axis.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke='#e2e8f0'
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={y(tick)}
                textAnchor='end'
                dominantBaseline='middle'
                className='fill-slate-400 text-[11px]'
              >
                {tick}
              </text>
            </g>
          ))}

          {buckets.map((bucket, i) =>
            i === n - 1 || (n - 1 - i) % LABEL_EVERY === 0 ? (
              <text
                key={bucket.end}
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor={i === n - 1 ? 'end' : 'middle'}
                className='fill-slate-400 text-[11px]'
              >
                {i === n - 1 ? 'Now' : formatTime(bucket.end)}
              </text>
            ) : null,
          )}

          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={MARGIN.top}
              y2={MARGIN.top + innerHeight}
              stroke='#94a3b8'
              strokeWidth={1}
            />
          )}

          {ACTIVITY_SERIES.map((series) => (
            <path
              key={series}
              d={buckets
                .map((b, i) => `${i ? 'L' : 'M'}${x(i)},${y(b[series])}`)
                .join(' ')}
              fill='none'
              stroke={SERIES_COLORS[series]}
              strokeWidth={2}
              strokeLinejoin='round'
              strokeLinecap='round'
            />
          ))}

          {hovered &&
            active !== null &&
            ACTIVITY_SERIES.map((series) => (
              <circle
                key={series}
                cx={x(active)}
                cy={y(hovered[series])}
                r={4.5}
                fill={SERIES_COLORS[series]}
                stroke='#ffffff'
                strokeWidth={2}
              />
            ))}
        </svg>

        {hovered && (
          <div
            role='status'
            className='pointer-events-none absolute top-0 w-40 rounded-xl border bg-white px-3 py-2 text-xs shadow-md'
            style={{ left: tooltipLeft }}
          >
            <p className='font-semibold text-slate-900'>
              {formatTime(hovered.start)} – {formatTime(hovered.end)}
            </p>
            <dl className='mt-1 space-y-0.5'>
              {ACTIVITY_SERIES.map((series) => (
                <div key={series} className='flex items-center gap-1.5'>
                  <SeriesKey series={series} />
                  <dt className='text-slate-500'>{ACTIVITY_LABELS[series]}</dt>
                  <dd className='ml-auto font-semibold text-slate-900'>
                    {hovered[series]}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
