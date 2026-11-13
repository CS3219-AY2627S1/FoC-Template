// AI-assisted (Claude), reviewed and tested by Maliha
import { useEffect, useState } from "react"
import { isAdmin, listUsers, setAdmin, type ApiUser } from "../../api/users"
import { TableMessage, tdCls, thCls } from "./table"

const joined = (iso: string) =>
  new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })

export default function UsersSection({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers]     = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState("")

  // per-row state for the admin toggle
  const [savingId, setSavingId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)

  const load = () => {
    setLoading(true)
    setError("")
    listUsers()
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load users."))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const toggleAdmin = (u: ApiUser) => {
    setSavingId(u.id)
    setRowError(null)
    setAdmin(u.id, !isAdmin(u))
      .then((updated) => setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x))))
      .catch((err) => setRowError({ id: u.id, message: err instanceof Error ? err.message : "Could not update role." }))
      .finally(() => setSavingId(null))
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-[#162A46] mb-5">User Management</h2>
      <div className="bg-white border border-[#E4E8E6] rounded-xl overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {["Student", "Username", "Email", "Role", "Joined", ""].map((h) => (
                <th key={h} className={thCls}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(loading || error || users.length === 0) ? (
              <TableMessage
                colSpan={6}
                loading={loading}
                loadingText="Loading users…"
                error={error}
                onRetry={load}
                emptyText="No users yet."
              />
            ) : users.map((u, i) => {
              const admin = isAdmin(u)
              return (
                <tr key={u.id} className={i < users.length - 1 ? "border-b border-[#E4E8E6]" : ""}>
                  <td className={tdCls}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#162A46] text-white text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
                        {u.firstName.charAt(0)}
                      </div>
                      <span className="font-medium whitespace-nowrap">
                        {u.firstName} {u.lastName}
                        {u.id === currentUserId && <span className="text-[#9CA3AF] font-normal"> (you)</span>}
                      </span>
                    </div>
                  </td>
                  <td className={`${tdCls} text-[#3F6B5A]`}>@{u.username}</td>
                  <td className={`${tdCls} text-[#3F6B5A]`}>{u.email}</td>
                  <td className={tdCls}>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                      admin ? "bg-[#162A46] text-white" : "bg-[#E8F1ED] text-[#1A4A36]"
                    }`}>
                      {admin ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className={`${tdCls} text-[#9CA3AF] whitespace-nowrap`}>{joined(u.createdAt)}</td>
                  <td className={`${tdCls} text-right`}>
                    <button
                      onClick={() => toggleAdmin(u)}
                      disabled={savingId === u.id}
                      className="text-xs font-medium text-[#3F6B5A] hover:text-[#1A4A36] disabled:opacity-50 whitespace-nowrap"
                    >
                      {savingId === u.id ? "Saving…" : admin ? "Remove admin" : "Make admin"}
                    </button>
                    {rowError?.id === u.id && (
                      <p className="text-[11px] text-red-600 mt-1 max-w-[12rem] ml-auto">{rowError.message}</p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}