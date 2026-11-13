import { cache } from 'react';

import { loadBalance } from '@/lib/credit-actions';

/**
 * The caller's balance for Server Components, deduplicated across the layout
 * and page in one request. Lives outside `credit-actions.ts` because a
 * `'use server'` module may only export async functions.
 */
export const getCreditBalance = cache(loadBalance);
