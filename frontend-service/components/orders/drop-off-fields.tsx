'use client';

import { ArrowRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

import { fieldClass } from '@/components/ui/field';
import {
  DROP_OFF_POINTS,
  labelFor,
  pinDropOff,
  presetAt,
  type DropOffValue,
  type LatLng,
} from '@/lib/drop-off';
import {
  MAX_DELIVERY_DETAILS_LENGTH,
  MAX_DELIVERY_LABEL_LENGTH,
} from '@/lib/orders';
import { lookUpPlaceName } from '@/lib/place-actions';
import { cn } from '@/lib/utils';

// Leaflet needs `window`, so the map only loads in the browser.
const DropOffMap = dynamic(() => import('@/components/orders/drop-off-map'), {
  ssr: false,
  loading: () => (
    <div className='h-56 w-full animate-pulse rounded-xl border bg-slate-100' />
  ),
});

type DropOffFieldsProps = {
  idPrefix: string;
  value: DropOffValue;
  onChange: (value: DropOffValue) => void;
  /**
   * Rendered before each control, so callers keep their own label style.
   * `missing` is true when a required control is still empty.
   */
  renderLabel: (
    htmlFor: string,
    text: string,
    missing: boolean,
  ) => React.ReactNode;
};

/** Element ids of the controls, so callers can link to or focus them. */
export function dropOffFieldIds(idPrefix: string) {
  return {
    point: `${idPrefix}-point`,
    details: `${idPrefix}-details`,
  };
}

export function DropOffFields({
  idPrefix,
  value,
  onChange,
  renderLabel,
}: DropOffFieldsProps) {
  const ids = dropOffFieldIds(idPrefix);
  const [lookingUp, setLookingUp] = useState(false);
  // The latest lookup, so a slow reply cannot rename a newer pin.
  const lookup = useRef(0);
  // The latest value, which a reply arriving after re-renders updates.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });

  function pin(position: LatLng) {
    const id = ++lookup.current;
    // A name typed before the first pin is the requester's own; keep it.
    if (!value.position && value.label.trim() && !presetAt(position)) {
      onChange({ ...value, position });
      setLookingUp(false);
      return;
    }
    const pinned = pinDropOff(value, position);
    onChange(pinned);
    // Quick picks already carry their building's name.
    if (presetAt(position)) {
      setLookingUp(false);
      return;
    }
    setLookingUp(true);
    lookUpPlaceName(position)
      .catch(() => null)
      .then((name) => {
        if (id !== lookup.current) return;
        setLookingUp(false);
        // Keep the label if the requester has typed their own meanwhile.
        const current = latest.current;
        if (name && current.label === pinned.label) {
          onChange({ ...current, label: name });
        }
      });
  }

  return (
    <div className='space-y-4'>
      <div>
        {renderLabel(ids.point, 'Drop-off Point', !value.position)}
        <div className='relative'>
          <ArrowRight
            className='text-courier pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2'
            aria-hidden
          />
          <input
            id={ids.point}
            list={`${ids.point}-buildings`}
            value={value.label}
            maxLength={MAX_DELIVERY_LABEL_LENGTH}
            onChange={(e) => {
              // Choosing a suggested building moves the pin there; any other
              // text renames the current pin.
              const point = DROP_OFF_POINTS.find(
                (p) => p.label === e.target.value,
              );
              if (point) pin(point);
              else onChange({ ...value, label: e.target.value });
            }}
            placeholder={
              value.position
                ? labelFor(value.position)
                : 'Choose a campus building or tap the map'
            }
            aria-describedby={`${ids.point}-hint`}
            autoComplete='off'
            className={cn(fieldClass, 'h-12 pl-10')}
          />
          <datalist id={`${ids.point}-buildings`}>
            {DROP_OFF_POINTS.map((point) => (
              <option key={point.id} value={point.label} />
            ))}
          </datalist>
        </div>
        <p
          id={`${ids.point}-hint`}
          aria-live='polite'
          className='mt-1.5 mb-1.5 text-xs text-slate-500'
        >
          {lookingUp
            ? 'Looking up the name of this spot…'
            : value.position
              ? 'Drag the pin to adjust it. You can rename the spot above.'
              : 'Or tap the map to pin the exact spot.'}
        </p>
        <DropOffMap position={value.position} onPick={pin} />
      </div>
      <div>
        {renderLabel(ids.details, 'Where exactly? (optional)', false)}
        <input
          id={ids.details}
          value={value.details}
          maxLength={MAX_DELIVERY_DETAILS_LENGTH}
          onChange={(e) => onChange({ ...value, details: e.target.value })}
          placeholder='e.g. Level 2 study area, table by the window'
          className={cn(fieldClass, 'h-12')}
        />
      </div>
    </div>
  );
}
