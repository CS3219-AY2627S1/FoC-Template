"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"

import { TransactionHistoryView } from "@/components/credits/transaction-history"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAdminApi } from "@/hooks/use-admin-api"
import { useAdminPage } from "@/hooks/use-admin-page"
import type { AdminSearch, AdminUser } from "@/lib/admin-api"
import { AdminComingSoon, AdminConfirmation, AdminDetails, AdminHeading, AdminLoadState, AdminPagination, AdminSearchForm, CopyId, adminDate } from "./admin-ui"

function AdminUserTransactions({ userId }: { userId: string }) {
  const api = useAdminApi()
  const [page, setPage] = useState(1)
  const load = useCallback((signal: AbortSignal) => api.userTransactions(userId, page, signal), [api, userId, page])
  const { data, loading, error, refresh } = useAdminPage(load)
  if (error) return <Card>
    <CardHeader><CardTitle className="text-xl">Credit transactions</CardTitle></CardHeader>
    <CardContent><AdminLoadState loading={loading} error={error} empty={false} retry={refresh} /></CardContent>
  </Card>
  return <TransactionHistoryView items={data?.items ?? []} totalItems={data?.totalItems ?? 0}
    totalPages={data?.totalPages ?? 0} page={page} onPage={setPage} error={!!error}
    loading={loading} refreshing={loading} refresh={refresh} />
}

export function AdminUserProfile({ userId, onBack }: { userId: string; onBack: () => void }) {
  const api = useAdminApi()
  const load = useCallback((signal: AbortSignal) => api.user(userId, signal), [api, userId])
  const { data, loading, error, refresh } = useAdminPage(load)
  const [updated, setUpdated] = useState<AdminUser | null>(null)
  const selected = updated ?? data
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [confirmSuspension, setConfirmSuspension] = useState<"suspend" | "unsuspend" | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const missing = "Not provided"

  async function mutate(action: () => Promise<AdminUser>, message: string) {
    setBusy(true)
    setActionError(null)
    try {
      setUpdated(await action())
      setConfirmDeactivate(false)
      setConfirmSuspension(null)
      toast.success(message)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not update the user.")
    } finally { setBusy(false) }
  }

  return <section className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:py-10">
    <Button variant="outline" disabled={busy} onClick={onBack}>Back to users</Button>
    <AdminHeading title={selected?.username ?? "User profile"} description="Review this user's account, credit activity and access." />
    <AdminLoadState loading={loading} error={error} empty={false} retry={refresh} />
    {selected && <>
      <Card>
        <CardHeader><CardTitle className="text-xl">Admin actions</CardTitle><CardDescription>Manage access for the selected user.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {!api.capabilities.userActions && <p className="text-sm text-muted-foreground">User management is coming soon.</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!api.capabilities.userActions || busy || !selected.active || selected.roles.includes("admin")}
              onClick={() => void mutate(() => api.promoteUser(selected.userId), "User promoted to admin.")}>
              {selected.roles.includes("admin") ? "Already an admin" : "Promote to Admin"}</Button>
            <Button variant="outline" disabled={!api.capabilities.userActions || busy || !selected.active}
              onClick={() => { setActionError(null); setConfirmSuspension(selected.isCourierSuspended ? "unsuspend" : "suspend") }}>
              {selected.isCourierSuspended ? "Unsuspend Courier" : "Suspend Courier"}</Button>
            <Button variant="destructive" disabled={!api.capabilities.userActions || busy || !selected.active}
              onClick={() => { setActionError(null); setConfirmDeactivate(true) }}>Deactivate User</Button>
          </div>
          {actionError && !confirmDeactivate && !confirmSuspension && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-xl">Profile summary</CardTitle><CardDescription>Account details and courier standing.</CardDescription></CardHeader>
        <CardContent><AdminDetails fields={[
          ["Name", selected.username], ["User ID", <CopyId key="uid" id={selected.userId} />],
          ["Profile ID", selected.id ? <CopyId key="profile" id={selected.id} /> : missing], ["Email", selected.email],
          ["Phone number", selected.phoneNumber ?? missing], ["Address", selected.address ?? missing],
          ["Roles", <div key="roles" className="flex flex-wrap gap-1">{selected.roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>)}</div>],
          ["Penalty score", selected.penalty],
          ["Account status", selected.accountStatus === "DEACTIVATION_PENDING" ? "Deactivation pending" : selected.active === null ? missing : <Badge key="status" variant={selected.active ? "outline" : "destructive"}>{selected.active ? "Active" : "Inactive"}</Badge>],
          ["Courier status", selected.isCourierSuspended ? "Suspended" : "Active"],
          ["Suspension ends", adminDate(selected.suspensionEndDate)],
        ]} /></CardContent>
      </Card>
      <AdminUserBalance key={"balance-" + selected.userId} userId={selected.userId} />
      {api.capabilities.creditTransactions ? <AdminUserTransactions key={"transactions-" + selected.userId} userId={selected.userId} />
        : <AdminComingSoon title="Credit transactions" />}
    </>}
    <AdminConfirmation open={confirmDeactivate} title="Deactivate this user?"
      description="This will deactivate the selected account. Please check that you have selected the correct user before continuing."
      busy={busy} error={actionError} onClose={() => { setConfirmDeactivate(false); setActionError(null) }}
      onConfirm={() => { if (selected) void mutate(() => api.deactivateUser(selected.userId), "User deactivated.") }} />
    <AdminConfirmation open={confirmSuspension !== null}
      title={confirmSuspension === "unsuspend" ? "Unsuspend this courier?" : "Suspend this courier?"}
      description={confirmSuspension === "unsuspend"
        ? "This will restore courier access. Their penalty score will not be reset."
        : "This will suspend courier access for one month and set the penalty score to 10. Existing errands can continue."}
      confirmLabel={confirmSuspension === "unsuspend" ? "Confirm unsuspension" : "Confirm suspension"}
      busyLabel={confirmSuspension === "unsuspend" ? "Unsuspending…" : "Suspending…"}
      confirmVariant={confirmSuspension === "unsuspend" ? "default" : "destructive"}
      cancelLabel="Cancel" busy={busy} error={actionError}
      onClose={() => { setConfirmSuspension(null); setActionError(null) }}
      onConfirm={() => {
        if (!selected || !confirmSuspension) return
        void mutate(() => confirmSuspension === "unsuspend" ? api.unsuspendUser(selected.userId) : api.suspendUser(selected.userId),
          confirmSuspension === "unsuspend" ? "Courier unsuspended." : "Courier suspended.")
      }} />
  </section>
}

export function AdminUsers() {
  return <AdminUserDirectory />
}

function AdminUserDirectory() {
  const api = useAdminApi()
  const [query, setQuery] = useState<AdminSearch>({ page: 1, searchBy: "id", q: "" })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const load = useCallback((signal: AbortSignal) => api.users(query, signal), [api, query])
  const { data, loading, error, refresh } = useAdminPage(load)

  if (selectedId) return <AdminUserProfile key={selectedId} userId={selectedId} onBack={() => { setSelectedId(null); refresh() }} />

  return <section className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
    <AdminHeading title="Users" description="Find a user, view their profile and manage account access." />
    <AdminSearchForm label="Users" initialSearchBy="id" onSearch={(searchBy, q) => setQuery({ page: 1, searchBy, q })} />
    <AdminLoadState loading={loading} error={error} empty={data?.items.length === 0} retry={refresh} />
    {data && data.items.length > 0 && <>
      <div className="overflow-x-auto rounded-xl border">
        <Table className="min-w-[1300px]"><TableHeader><TableRow>{["Name", "Email", "User ID", "Roles", "Account status", "Courier status", "Available credits", "Reserved credits", "Total credits", ""].map((title, index) =>
          <TableHead key={index}>{title || <span className="sr-only">Profile</span>}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{data.items.map((user) => <TableRow key={user.userId}>
            <TableCell><button type="button" className="inline-flex max-w-40 text-left font-normal no-underline decoration-2 underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-ring" title={user.username} onClick={() => setSelectedId(user.userId)}><span className="min-w-0 truncate">{user.username}</span></button></TableCell>
            <TableCell><span className="block max-w-52 truncate" title={user.email}>{user.email}</span></TableCell>
            <TableCell><CopyId id={user.userId} compact /></TableCell>
            <TableCell><span className="block max-w-40 truncate" title={user.roles.join(", ")}>{user.roles.join(", ")}</span></TableCell>
            <TableCell><Badge variant="outline">{user.active === null ? "Unavailable" : user.active ? "Active" : "Inactive"}</Badge></TableCell>
            <TableCell><Badge variant="outline">{user.isCourierSuspended ? "Suspended" : "Active"}</Badge></TableCell>
            <TableCell>{user.usableBalance ?? "—"}</TableCell>
            <TableCell>{user.reservedBalance ?? "—"}</TableCell>
            <TableCell>{user.totalBalance ?? "—"}</TableCell>
            <TableCell><Button size="sm" variant="outline" aria-label={"View profile of " + user.username} onClick={() => setSelectedId(user.userId)}>View profile</Button></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </div>
      <AdminPagination {...data} onPage={(page) => setQuery((current) => ({ ...current, page }))} />
    </>}
  </section>
}


function AdminUserBalance({ userId }: { userId: string }) {
  const api = useAdminApi()
  const load = useCallback((signal: AbortSignal) => api.userBalance(userId, signal), [api, userId])
  const { data, loading, error, refresh } = useAdminPage(load)
  return <Card>
    <CardHeader><CardTitle className="text-xl">Credit balance</CardTitle><CardDescription>Selected user&apos;s credit balance.</CardDescription></CardHeader>
    <CardContent>
      <AdminLoadState loading={loading} error={error} empty={false} retry={refresh} />
      {data && !error && <dl className="grid gap-5 sm:grid-cols-3">
        {[["Available credits", data.usableBalance], ["Reserved credits", data.reservedBalance], ["Total credits", data.totalBalance]].map(([label, value]) =>
          <div key={String(label)}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value ?? "Unavailable"}</dd></div>)}
      </dl>}
    </CardContent>
  </Card>
}
