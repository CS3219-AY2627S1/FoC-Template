"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { useAuth } from "@/components/providers/auth-provider"
import { TransactionHistory } from "@/components/credits/transaction-history"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"

type UserProfile = {
  username: string
  email: string
  roles: string[]
  penalty: number
  isCourierSuspended: boolean
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth()
  const api = useApi()
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState(false)

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    if (!user) return
    setProfileLoading(true)
    setProfileError(false)
    try {
      const data = await api<UserProfile>("/api/users/me", { signal })
      if (!signal?.aborted) setProfile(data)
    } catch {
      if (!signal?.aborted) setProfileError(true)
    } finally {
      if (!signal?.aborted) setProfileLoading(false)
    }
  }, [api, user])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.replace("/login")
      return
    }
    const controller = new AbortController()
    const initial = window.setTimeout(() => void loadProfile(controller.signal), 0)
    return () => {
      window.clearTimeout(initial)
      controller.abort()
    }
  }, [authLoading, loadProfile, router, user])

  if (authLoading || !user) {
    return <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6"><Skeleton className="h-56 w-full" /><Skeleton className="h-80 w-full" /></div>
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:py-10">
      <header>
        <p className="text-sm text-muted-foreground">Account</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My profile</h1>
        <p className="mt-1 text-muted-foreground">Review your account and credit activity.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/profile/edit")}>Edit profile</Button>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-xl">Profile summary</CardTitle><CardDescription>Your account details and courier standing.</CardDescription></CardHeader>
        <CardContent>
          {profileLoading && !profile ? (
            <div aria-label="Loading profile" className="grid gap-4 sm:grid-cols-2">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div>
          ) : profile ? (
            <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-sm text-muted-foreground">Account name</dt><dd className="mt-1 break-all font-medium">{profile.username}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Email</dt><dd className="mt-1 break-all font-medium">{profile.email}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Roles</dt><dd className="mt-1 flex flex-wrap gap-1">{profile.roles.map((role) => <Badge key={role} variant="secondary">{role}</Badge>)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Courier status</dt><dd className="mt-1"><Badge variant={profile.isCourierSuspended ? "destructive" : "outline"}>{profile.isCourierSuspended ? "Suspended" : "Active"}</Badge></dd></div>
              <div><dt className="text-sm text-muted-foreground">Penalty</dt><dd className="mt-1 font-medium">{profile.penalty} penalties</dd></div>
            </dl>
          ) : null}
          {profileError && (
            <Alert variant="destructive" className={profile ? "mt-4" : undefined}>
              <AlertTitle>Profile could not be loaded</AlertTitle><AlertDescription>Check your connection and try again.</AlertDescription>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadProfile()}>Try again</Button>
            </Alert>
          )}
        </CardContent>
      </Card>

      <TransactionHistory />
    </main>
  )
}
