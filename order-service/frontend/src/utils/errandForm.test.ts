import { describe, expect, it } from 'vitest'
import {
  creditCheck,
  fieldsFromOrder,
  reservationOutcome,
  rewardChangeCheck,
  rewardChangeOutcome,
} from './errandForm'

describe('creditCheck', () => {
  it('allows posting when the reward fits, including exactly equal', () => {
    expect(creditCheck({ kind: 'loaded', available: 10 }, 3)).toEqual({
      canPost: true,
      message: null,
    })
    expect(creditCheck({ kind: 'loaded', available: 10 }, 10).canPost).toBe(
      true,
    )
  })

  it('blocks a reward above the available credits and says the limit', () => {
    expect(creditCheck({ kind: 'loaded', available: 10 }, 11)).toEqual({
      canPost: false,
      message: 'You have 10 credits. Lower the reward to 10 or less.',
    })
    expect(creditCheck({ kind: 'loaded', available: 1 }, 2).message).toBe(
      'You have 1 credit. Lower the reward to 1 or less.',
    )
  })

  it('does not block before a reward is entered', () => {
    expect(creditCheck({ kind: 'loaded', available: 0 }, null).canPost).toBe(
      true,
    )
  })

  it('blocks until the balance is confirmed', () => {
    expect(creditCheck({ kind: 'loading' }, 3).canPost).toBe(false)
    expect(creditCheck({ kind: 'no-account' }, 3).canPost).toBe(false)
  })

  it('blocks when Credit is unavailable', () => {
    const result = creditCheck({ kind: 'unavailable' }, 3)
    expect(result.canPost).toBe(false)
    expect(result.message).toContain("can't check your credits")
  })
})

describe('reservationOutcome', () => {
  it('keeps waiting while the errand is pending credit and opens otherwise', () => {
    expect(reservationOutcome('PENDING_CREDIT', null, 3)).toEqual({ kind: 'waiting' })
    expect(reservationOutcome('OPEN', null, 3)).toEqual({ kind: 'reserved' })
  })

  it('explains each rejection reason', () => {
    expect(reservationOutcome('RESERVATION_FAILED', 'INSUFFICIENT_CREDITS', 1)).toMatchObject({
      kind: 'failed',
      message: "You don't have enough credits for a reward of 1. Lower it and post again.",
      setUpCredits: false,
    })
    expect(
      reservationOutcome('RESERVATION_FAILED', 'CREDIT_ACCOUNT_NOT_FOUND', 3),
    ).toMatchObject({ kind: 'failed', setUpCredits: true })
    expect(
      reservationOutcome('RESERVATION_FAILED', 'CREDIT_RESERVATION_REJECTED', 3),
    ).toMatchObject({ kind: 'failed', message: expect.stringContaining('Please try again') })
  })

  it('reports that Credit did not answer in time', () => {
    expect(
      reservationOutcome('EXPIRED', 'CREDIT_RESERVATION_TIMEOUT', 3),
    ).toMatchObject({
      kind: 'failed',
      message: expect.stringContaining('Your credits are safe'),
      setUpCredits: false,
    })
  })

  it('reports a deadline that passed while waiting', () => {
    expect(reservationOutcome('EXPIRED', 'PICKUP_DEADLINE_PASSED', 3)).toMatchObject({
      kind: 'failed',
      message: expect.stringContaining('pickup time has already passed'),
    })
  })
})

describe('rewardChangeCheck', () => {
  const loaded = (available: number) => ({ kind: 'loaded' as const, available })

  it('always allows lowering or keeping the reward', () => {
    expect(rewardChangeCheck({ kind: 'unavailable' }, 5, 2).canSave).toBe(true)
    expect(rewardChangeCheck({ kind: 'loading' }, 5, 5).canSave).toBe(true)
  })

  it('needs only the difference to be available when raising', () => {
    expect(rewardChangeCheck(loaded(2), 3, 5).canSave).toBe(true)
    expect(rewardChangeCheck(loaded(1), 3, 5)).toEqual({
      canSave: false,
      message: "You don't have enough credits for 5. Choose 4 or less.",
    })
  })

  it('pauses raising until the balance is known', () => {
    expect(rewardChangeCheck({ kind: 'loading' }, 3, 5).canSave).toBe(false)
    expect(rewardChangeCheck({ kind: 'unavailable' }, 3, 5).canSave).toBe(false)
  })
})

describe('rewardChangeOutcome', () => {
  const open = (creditReward: number, pendingCreditReward: number | null = null) => ({
    state: 'OPEN',
    creditReward,
    pendingCreditReward,
  })

  it('waits while the change is pending', () => {
    expect(rewardChangeOutcome(open(3, 5), [], 5, 2)).toEqual({ kind: 'waiting' })
  })

  it('is applied once the reward equals the requested value', () => {
    expect(
      rewardChangeOutcome(open(5), [{ action: 'REWARD_CHANGE_APPLIED', orderVersion: 3 }], 5, 2),
    ).toEqual({ kind: 'applied' })
  })

  it('is rejected when Credit refused and the old reward stands', () => {
    expect(
      rewardChangeOutcome(open(3), [{ action: 'REWARD_CHANGE_REJECTED', orderVersion: 3 }], 5, 2),
    ).toEqual({
      kind: 'rejected',
      message: "You don't have enough credits for a reward of 5, so it stays at 3.",
    })
  })

  it('ignores answers to earlier changes and reports an errand that left OPEN', () => {
    expect(
      rewardChangeOutcome(open(5), [{ action: 'REWARD_CHANGE_REJECTED', orderVersion: 1 }], 5, 2),
    ).toEqual({ kind: 'applied' })
    expect(rewardChangeOutcome({ state: 'CANCELLED', creditReward: 3, pendingCreditReward: null }, [], 5, 2))
      .toEqual({ kind: 'ended' })
  })
})

describe('fieldsFromOrder', () => {
  it('fills the form from the errand, with the deadline in local time', () => {
    const deadline = new Date(2030, 0, 2, 9, 5)
    expect(
      fieldsFromOrder({
        title: 'Notes',
        description: 'Bound set',
        pickupLocationId: 'p',
        dropoffLocationId: 'd',
        creditReward: 4,
        pickupDeadline: deadline.toISOString(),
      }),
    ).toEqual({
      title: 'Notes',
      description: 'Bound set',
      pickupLocationId: 'p',
      dropoffLocationId: 'd',
      creditReward: '4',
      pickupDeadline: '2030-01-02T09:05',
    })
  })
})
