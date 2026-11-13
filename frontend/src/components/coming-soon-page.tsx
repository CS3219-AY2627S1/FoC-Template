/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-28
 * Mode: Code generation.
 * Scope: Generated the reusable authenticated coming-soon page presentation.
 * Author review: I reviewed for correctness and edited where needed.
 */
import type { LucideIcon } from "lucide-react"

import { RequireAuth } from "@/components/require-auth"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export function ComingSoonPage({
  description,
  icon: Icon,
  title,
}: {
  description: string
  icon: LucideIcon
  title: string
}) {
  return (
    <RequireAuth>
      <div className="mx-auto flex w-full max-w-6xl flex-1 px-4 py-8">
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
            <EmptyTitle>{title}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </RequireAuth>
  )
}
