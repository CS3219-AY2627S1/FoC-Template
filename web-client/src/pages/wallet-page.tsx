// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-13
// Scope: Implemented the Credits wallet page matching the Figma design.
// Author review: I validated correctness and supplied additional boundary checks.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { isApiRequestError } from "../api/client";
import { creditService, type CreditPage, type CreditTransaction, type Wallet } from "../api/credit-service";
import { useAuth } from "../app/use-auth";
import { OrderPagination } from "../components/order-ui";
import { WorkspaceShell } from "../components/workspace-shell";

const PAGE_SIZE = 10;
const SUMMARY = "Credits are reserved for open errands and transferred only after completion.";

type Activity = { label: string; tone: "reserved" | "earned" | "released" | "paid"; sign: "+" | "−" };

function activity(item: CreditTransaction, me: string): Activity {
  if (item.type === "ALLOCATION") return { label: "Welcome", tone: "earned", sign: "+" };
  if (item.type === "RESERVATION") return { label: "Reserved", tone: "reserved", sign: "−" };
  if (item.type === "RELEASE") return { label: "Released", tone: "released", sign: "+" };
  return item.counterpartyUserId === me
    ? { label: "Earned", tone: "earned", sign: "+" }
    : { label: "Paid", tone: "paid", sign: "−" };
}

const sgtDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" });
const sgtDate = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric" });
const sgtClock = new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit" });

function activityTime(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  const day = sgtDay.format(date);
  const yesterday = new Date(now.getTime() - 86_400_000);
  const label = day === sgtDay.format(now) ? "Today" : day === sgtDay.format(yesterday) ? "Yesterday" : sgtDate.format(date);
  return `${label} · ${sgtClock.format(date).toUpperCase()}`;
}

function BalanceStat({ label, value, note, compact = false }: { label: string; value: number; note?: string; compact?: boolean }) {
  return <article className={`wallet-stat${compact ? " wallet-stat-compact" : ""}`}>
    <p>{label}</p>
    <strong>{value}<span className="wallet-unit"> credits</span></strong>
    {note ? <span>{note}</span> : null}
  </article>;
}

function ActivityRow({ item, me }: { item: CreditTransaction; me: string }) {
  const { label, tone, sign } = activity(item, me);
  const title = item.orderId ? `${label} · #${item.orderId.slice(0, 8).toUpperCase()}` : `${label} credits`;
  const content = <>
    <span className="wallet-activity-detail">
      <strong>{title}</strong>
      <time dateTime={item.createdAt}>{activityTime(item.createdAt)}</time>
    </span>
    <span className="wallet-activity-amount">
      <span className={`wallet-pill wallet-tone-${tone}`}>{label.toUpperCase()}</span>
      <strong className={`wallet-tone-${tone}`}>{sign}{item.amount}</strong>
    </span>
  </>;
  return <li>
    {item.orderId
      ? <Link aria-label={`${title}, ${sign}${item.amount} credits. View errand`} className="wallet-activity-row" to={`/orders/${item.orderId}`}>{content}</Link>
      : <div className="wallet-activity-row">{content}</div>}
  </li>;
}

export function WalletPage() {
  const { user, withCurrentAccess } = useAuth();
  const [page, setPage] = useState(1);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [history, setHistory] = useState<CreditPage<CreditTransaction> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    // The wallet read get-or-creates it, so request it before reading its history.
    withCurrentAccess(async (token) => {
      const nextWallet = await creditService.myWallet(token);
      const nextHistory = await creditService.myTransactions({ page, pageSize: PAGE_SIZE }, token);
      return [nextWallet, nextHistory] as const;
    })
      .then(([nextWallet, nextHistory]) => {
        if (!active) return;
        setWallet(nextWallet);
        setHistory(nextHistory);
      })
      .catch((failure) => {
        if (!active) return;
        setError(isApiRequestError(failure) && failure.code === "WALLET_NOT_READY"
          ? "Your wallet is being set up. Refresh in a moment."
          : "Credits are unavailable right now. Try again shortly.");
      });
    return () => { active = false; };
  }, [page, withCurrentAccess]);

  return <WorkspaceShell className="order-shell wallet-shell" userDescription="Your credits for requesting and delivering errands.">
    <header className="order-heading"><div><h1>Credit wallet</h1><p>{SUMMARY}</p></div></header>
    {error ? <section className="order-panel order-error" role="alert"><p>{error}</p></section> : null}
    {wallet ? <section aria-label="Credit balance" className="wallet-balances">
      <BalanceStat label="Available" note="Spendable now" value={wallet.available} />
      <BalanceStat compact label="Reserved" value={wallet.reserved} />
      <BalanceStat compact label="Total" note="Closed campus economy" value={wallet.total} />
    </section> : null}
    {history && user ? <section aria-label="Credit history" className="wallet-activity">
      <h2>Recent activity</h2>
      {history.items.length === 0
        ? <p className="wallet-empty">No credit activity yet.</p>
        : <ul>{history.items.map((item) => <ActivityRow item={item} key={item.transactionId} me={user.userId} />)}</ul>}
      {history.total > history.pageSize
        ? <OrderPagination onPage={setPage} page={page} pageSize={history.pageSize} total={history.total} />
        : null}
    </section> : null}
    {wallet ? <p className="wallet-footnote">Credits stay inside campus — they cannot be cashed out or transferred outside an errand.</p> : null}
  </WorkspaceShell>;
}
