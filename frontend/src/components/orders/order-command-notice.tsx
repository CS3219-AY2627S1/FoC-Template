"use client"

import { Button } from "@/components/ui/button"

export function OrderCommandNotice({ message, needsAuthorization, continueRecovery }: {
  message: string | null; needsAuthorization: boolean; continueRecovery: () => Promise<void>
}) {
  if (!message) return null
  return <div className="space-y-2 text-sm text-muted-foreground" role="status">
    <p>{message}</p>
    {needsAuthorization && <Button size="sm" variant="outline" onClick={() => void continueRecovery()}>Continue with authorization</Button>}
  </div>
}
