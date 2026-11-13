"use client"

import { useRouter } from "next/navigation"
import { AdminUserProfile } from "./admin-users"

export function AdminSelectedUser({ userId }: { userId: string }) {
  const router = useRouter()
  return <AdminUserProfile key={userId} userId={userId} onBack={() => router.push("/admin/users")} />
}
