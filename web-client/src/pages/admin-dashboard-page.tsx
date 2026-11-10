// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29
// Scope: Implemented the Admin Dashboard analytics, platform credit and user activity panels.
// Author review: I validated correctness and supplied additional boundary checks.

import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isApiRequestError } from "../api/client";
import { adminCreditService, type CreditTransaction } from "../api/credit-service";
import { adminOrderService, type CountsByState } from "../api/order-service";
import { ALL_STATES, dayLabel, duration, percent, shiftDay, shortId, singaporeToday, stateLabel } from "../app/admin-presentation";
import { orderTime } from "../app/order-presentation";
import { useAdminResource } from "../app/use-admin-resource";
import { AdminPanel } from "../components/admin-ui";
import { OrderPagination } from "../components/order-ui";
import { WorkspaceShell } from "../components/workspace-shell";

const DESCRIPTION = "Oversee errands, disputes and platform analytics.";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TRANSACTIONS_PAGE_SIZE = 10;

function StateCounts({ counts }: { counts: CountsByState }) {
  return <dl className="admin-state-counts">
    {ALL_STATES.map((state) => <div key={state}><dt>{stateLabel(state)}</dt><dd>{counts[state]}</dd></div>)}
  </dl>;
}

// Mirrors the wallet page's wording, seen from the selected user's side.
function transactionLabel(item: CreditTransaction, userId: string): { label: string; sign: "+" | "−" } {
  if (item.type === "ALLOCATION") return { label: "Welcome credits", sign: "+" };
  if (item.type === "RESERVATION") return { label: "Reserved for an errand", sign: "−" };
  if (item.type === "RELEASE") return { label: "Released back", sign: "+" };
  return item.counterpartyUserId === userId
    ? { label: "Earned from an errand", sign: "+" }
    : { label: "Paid for an errand", sign: "−" };
}

// A user who has never used credits has no wallet yet; that is not a failure.
function noWallet(failure: unknown): null {
  if (isApiRequestError(failure) && failure.code === "WALLET_NOT_READY") return null;
  throw failure;
}

export function AdminDashboardPage() {
  const [params, setParams] = useSearchParams();
  const today = singaporeToday();
  const requestedTo = params.get("to") ?? "";
  const requestedFrom = params.get("from") ?? "";
  const to = DAY.test(requestedTo) ? requestedTo : today;
  const from = DAY.test(requestedFrom) ? requestedFrom : shiftDay(to, -6);
  const [draft, setDraft] = useState({ from, to });
  const [lookup, setLookup] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [transactionsPage, setTransactionsPage] = useState(1);

  const orders = useAdminResource((token) => adminOrderService.analytics(from, to, token), `orders:${from}:${to}`);
  const credit = useAdminResource((token) => adminCreditService.analytics(from, to, token), `credit:${from}:${to}`);
  const user = useAdminResource(
    userId ? (token) => adminOrderService.userAnalytics(userId, from, to, token) : null,
    `user:${userId}:${from}:${to}`,
  );
  const wallet = useAdminResource(
    userId ? (token) => adminCreditService.wallet(userId, token).catch(noWallet) : null,
    `wallet:${userId}`,
  );
  const transactions = useAdminResource(
    userId ? (token) => adminCreditService.transactions(userId, { page: transactionsPage, pageSize: TRANSACTIONS_PAGE_SIZE }, token) : null,
    `transactions:${userId}:${transactionsPage}`,
  );

  function applyPeriod(event: FormEvent) {
    event.preventDefault();
    setParams({ from: draft.from, to: draft.to });
  }

  function lastDays(days: number) {
    const next = { from: shiftDay(today, -(days - 1)), to: today };
    setDraft(next);
    setParams(next);
  }

  function findUser(event: FormEvent) {
    event.preventDefault();
    setUserId(lookup.trim().toLowerCase() || null);
    setTransactionsPage(1);
  }

  const summary = orders.data;
  const busiestDay = Math.max(1, ...(summary?.daily.map((day) => day.created) ?? []));
  const newestDayFirst = summary ? [...summary.daily].reverse() : [];
  const platform = credit.data;
  const activity = user.data;
  const history = transactions.data;

  return <WorkspaceShell adminDescription={DESCRIPTION} className="order-shell admin-shell" userDescription={DESCRIPTION}>
    <header className="order-heading"><div>
      <h1>Dashboard</h1>
      <p>Errands created from {dayLabel(from)} to {dayLabel(to)}, by Singapore date.</p>
    </div></header>

    <form aria-label="Reporting period" className="admin-period" onSubmit={applyPeriod}>
      <label className="order-label">From<input max={draft.to} onChange={(event) => setDraft({ ...draft, from: event.target.value })} required type="date" value={draft.from} /></label>
      <label className="order-label">To<input min={draft.from} onChange={(event) => setDraft({ ...draft, to: event.target.value })} required type="date" value={draft.to} /></label>
      <button className="order-button" type="submit">Apply</button>
      <button className="order-button order-secondary" onClick={() => lastDays(7)} type="button">Last 7 days</button>
      <button className="order-button order-secondary" onClick={() => lastDays(30)} type="button">Last 30 days</button>
    </form>

    <div className="admin-grid">
      <AdminPanel resource={orders} title="Errand overview" wide>
        {summary ? <>
          <dl className="admin-tiles">
            <div><dt>Errands created</dt><dd>{summary.totalCreated}</dd></div>
            <div><dt>Completion rate</dt><dd>{percent(summary.rates.completed)}</dd></div>
            <div><dt>Cancellation rate</dt><dd>{percent(summary.rates.cancelled)}</dd></div>
            <div><dt>Expiry rate</dt><dd>{percent(summary.rates.expired)}</dd></div>
            <div><dt>Failure rate</dt><dd>{percent(summary.rates.failed)}</dd></div>
            <div><dt>Mean time to complete</dt><dd>{duration(summary.meanCompletionMinutes)}</dd></div>
          </dl>
          <h3 className="admin-subheading">Current state of these errands</h3>
          <StateCounts counts={summary.byState} />
          <p className="order-muted">Each rate is the share of errands created in this period that are now in that state.</p>
        </> : null}
      </AdminPanel>

      <AdminPanel resource={orders} title="Errands created per day">
        {summary ? <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th scope="col">Day</th><th scope="col">Errands created</th></tr></thead>
          <tbody>{newestDayFirst.map((day) => <tr key={day.day}>
            <th scope="row">{dayLabel(day.day)}</th>
            <td><span className="admin-bar-cell">
              <span aria-hidden="true" className="admin-bar" style={{ width: `${(day.created / busiestDay) * 100}%` }} />
              <span>{day.created}</span>
            </span></td>
          </tr>)}</tbody>
        </table></div> : null}
      </AdminPanel>

      <AdminPanel resource={orders} title="Participants">
        {summary ? <>
          <dl className="admin-tiles">
            <div><dt>Requesters</dt><dd>{summary.participants.requesters}</dd></div>
            <div><dt>Couriers</dt><dd>{summary.participants.couriers}</dd></div>
            <div><dt>Distinct users</dt><dd>{summary.participants.distinctParticipants}</dd></div>
          </dl>
          <p className="order-muted">A user who both requested and delivered counts once in distinct users.</p>
        </> : null}
      </AdminPanel>

      <AdminPanel resource={orders} title="Suppliers" wide>
        {summary ? summary.suppliers.length === 0
          ? <p className="order-muted">No errands were created in this period.</p>
          : <div className="admin-table-wrap"><table className="admin-table">
            <thead><tr><th scope="col">Supplier</th><th scope="col">Created</th><th scope="col">Completed</th><th scope="col">Mean time to complete</th></tr></thead>
            <tbody>{summary.suppliers.map((supplier) => <tr key={supplier.supplierId}>
              <th scope="row">{supplier.supplierName}</th>
              <td>{supplier.created}</td>
              <td>{supplier.completed}</td>
              <td>{duration(supplier.meanCompletionMinutes)}</td>
            </tr>)}</tbody>
          </table></div> : null}
      </AdminPanel>

      <AdminPanel resource={credit} title="Platform credits" wide>
        {platform ? <>
          <h3 className="admin-subheading">Current balances across all wallets</h3>
          <dl className="admin-tiles">
            <div><dt>Available</dt><dd>{platform.circulation.available}</dd></div>
            <div><dt>Reserved in errands</dt><dd>{platform.circulation.reserved}</dd></div>
            <div><dt>Total in circulation</dt><dd>{platform.circulation.total}</dd></div>
          </dl>
          <h3 className="admin-subheading">Transfers completed in this period</h3>
          <dl className="admin-tiles">
            <div><dt>Transfers</dt><dd>{platform.transfers.count}</dd></div>
            <div><dt>Credits transferred</dt><dd>{platform.transfers.amount}</dd></div>
          </dl>
          <p className="order-muted">Wallet balances are reported separately from errand rewards. Look up a user below to see one wallet.</p>
        </> : null}
      </AdminPanel>

      <AdminPanel
        intro={<form aria-label="Find user activity" className="admin-inline-form" onSubmit={findUser}>
          <label className="order-label">User ID<input onChange={(event) => setLookup(event.target.value)} value={lookup} /></label>
          <button className="order-button order-secondary" disabled={!lookup.trim()} type="submit">Show activity</button>
        </form>}
        resource={user}
        title="User activity"
      >
        {activity ? <div className="admin-columns">
          {([["asRequester", "As requester"], ["asCourier", "As courier"]] as const).map(([role, label]) => <div key={role}>
            <h3 className="admin-subheading">{label}: {activity[role].total} errands</h3>
            <StateCounts counts={activity[role].byState} />
          </div>)}
        </div> : null}
      </AdminPanel>

      {userId ? <AdminPanel resource={wallet} title="Wallet">
        {wallet.data ? <>
          <dl className="admin-tiles">
            <div><dt>Available</dt><dd>{wallet.data.available}</dd></div>
            <div><dt>Reserved</dt><dd>{wallet.data.reserved}</dd></div>
            <div><dt>Total</dt><dd>{wallet.data.total}</dd></div>
          </dl>
          <p className="order-muted">Read-only. Balances change only through errands.</p>
        </> : <p className="order-muted">This user has no wallet yet.</p>}
      </AdminPanel> : null}

      {userId ? <AdminPanel resource={transactions} title="Credit transactions" wide>
        {history ? history.items.length === 0
          ? <p className="order-muted">No credit transactions yet.</p>
          : <>
            <ul className="admin-list">
              {history.items.map((item) => {
                const { label, sign } = transactionLabel(item, userId);
                return <li key={item.transactionId}><div className="admin-list-item">
                  <span className="admin-row-title"><strong>{label}</strong><strong>{sign}{item.amount} credits</strong></span>
                  <span className="admin-row-meta">
                    {item.orderId ? <Link to={`/admin/orders/${item.orderId}`}>Errand #{shortId(item.orderId)}</Link> : <span>Initial allocation</span>}
                    <time dateTime={item.createdAt}>{orderTime(item.createdAt)} SGT</time>
                  </span>
                </div></li>;
              })}
            </ul>
            <OrderPagination loading={transactions.loading} onPage={setTransactionsPage} page={transactionsPage} pageSize={history.pageSize} total={history.total} />
          </> : null}
      </AdminPanel> : null}
    </div>
  </WorkspaceShell>;
}
