'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { type CreditBalanceResult, loadBalance } from '@/lib/credit-actions';

// Credit Service applies order events from Kafka, usually within a second or two.
const BALANCE_POLL_MS = 1000;
const BALANCE_POLL_ATTEMPTS = 10;

type CreditBalanceContextValue = {
  credit: CreditBalanceResult;
  /**
   * Re-reads the balance until Credit Service has applied a change, so only
   * the balance re-renders instead of the whole layout and page.
   */
  watchForBalanceChange: () => void;
};

const CreditBalanceContext = createContext<CreditBalanceContextValue | null>(
  null,
);

function balanceKey(result: CreditBalanceResult) {
  if (!result.ok) return 'unavailable';
  if (!result.balance) return 'none';
  const { available_balance, reserved_balance, total_balance, updated_at } =
    result.balance;
  return `${available_balance}/${reserved_balance}/${total_balance}/${updated_at}`;
}

export function CreditBalanceProvider({
  initial,
  children,
}: {
  initial: CreditBalanceResult;
  children: React.ReactNode;
}) {
  const [credit, setCredit] = useState(initial);
  // A layout re-render (navigation, router.refresh) brings a fresher balance.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setCredit(initial);
  }

  const creditRef = useRef(credit);
  useEffect(() => {
    creditRef.current = credit;
  }, [credit]);

  // Bumping the generation stops any poll in flight: on unmount, or when a
  // newer watch replaces it.
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(
    () => () => {
      generation.current++;
      clearTimeout(timer.current);
    },
    [],
  );

  const watchForBalanceChange = useCallback(() => {
    clearTimeout(timer.current);
    const current = ++generation.current;
    const baseline = balanceKey(creditRef.current);
    let attempts = 0;

    const poll = async () => {
      let result: CreditBalanceResult | null;
      try {
        result = await loadBalance();
      } catch {
        result = null;
      }
      if (current !== generation.current) return;
      if (result?.ok) {
        setCredit(result);
        if (balanceKey(result) !== baseline) return;
      }
      // Bounded: an admin cancelling someone else's errand never changes
      // their own balance.
      if (++attempts < BALANCE_POLL_ATTEMPTS) {
        timer.current = setTimeout(poll, BALANCE_POLL_MS);
      }
    };
    timer.current = setTimeout(poll, BALANCE_POLL_MS);
  }, []);

  return (
    <CreditBalanceContext.Provider value={{ credit, watchForBalanceChange }}>
      {children}
    </CreditBalanceContext.Provider>
  );
}

export function useCreditBalance() {
  const value = useContext(CreditBalanceContext);
  if (!value) {
    throw new Error(
      'useCreditBalance must be used inside CreditBalanceProvider',
    );
  }
  return value;
}
