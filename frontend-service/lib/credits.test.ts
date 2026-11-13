import { describe, expect, it } from 'vitest';

import type { CreditBalance, CreditTransaction } from '@/lib/credit-service';
import {
  describeTransaction,
  formatCreditChange,
  offerLimits,
} from '@/lib/credits';
import { MAX_CREDIT_AMOUNT } from '@/lib/orders';

function transaction(fields: Partial<CreditTransaction>) {
  return {
    transaction_type: 'TRANSFER',
    outcome: 'SUCCEEDED',
    reason: '',
    available_delta: 0,
    reserved_delta: 0,
    ...fields,
  } as CreditTransaction;
}

function account(available: number) {
  return {
    ok: true as const,
    balance: { available_balance: available } as CreditBalance,
  };
}

describe('describeTransaction', () => {
  it('names settlements by reason and falls back for unknown ones', () => {
    expect(
      describeTransaction(
        transaction({ reason: 'ORDER_COMPLETED_COURIER_CREDIT' }),
      ),
    ).toBe('Earned from an errand');
    expect(describeTransaction(transaction({ reason: 'NEW_REASON' }))).toBe(
      'Errand settlement',
    );
  });

  it('explains a refused reservation', () => {
    expect(
      describeTransaction(
        transaction({
          transaction_type: 'RESERVATION',
          outcome: 'REJECTED',
          reason: 'INSUFFICIENT_CREDIT',
        }),
      ),
    ).toBe('Errand refused: not enough credit');
  });
});

describe('formatCreditChange', () => {
  it('shows gains and losses by their net effect', () => {
    expect(formatCreditChange(transaction({ available_delta: 5 }))).toEqual({
      text: '+5 cr',
      tone: 'gain',
    });
    expect(formatCreditChange(transaction({ reserved_delta: -5 }))).toEqual({
      text: '-5 cr',
      tone: 'loss',
    });
  });

  it('shows holds and releases as movements', () => {
    expect(
      formatCreditChange(
        transaction({ available_delta: -10, reserved_delta: 10 }),
      ),
    ).toEqual({ text: '10 cr held', tone: 'movement' });
    expect(
      formatCreditChange(
        transaction({ available_delta: 10, reserved_delta: -10 }),
      ),
    ).toEqual({ text: '10 cr returned', tone: 'movement' });
  });
});

describe('offerLimits', () => {
  it('caps the offer at the available balance', () => {
    expect(offerLimits(account(4), 100)).toEqual({
      max: 4,
      hasCredit: true,
      initial: 4,
    });
  });

  it('uses the initial allocation before an account exists', () => {
    expect(offerLimits({ ok: true, balance: null }, 100)).toMatchObject({
      max: 100,
      initial: 10,
    });
  });

  it("falls back to Order Service's limit when the balance is unknown", () => {
    expect(
      offerLimits({ ok: false, status: 503, message: 'down' }, 100).max,
    ).toBe(MAX_CREDIT_AMOUNT);
  });

  it('reports when there is nothing to offer', () => {
    expect(offerLimits(account(0), 100)).toMatchObject({
      hasCredit: false,
      initial: 1,
    });
  });
});
