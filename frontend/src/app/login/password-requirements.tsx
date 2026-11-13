"use client"

import { useEffect, useState } from "react"
import { CheckIcon, XIcon } from "lucide-react"
import { validatePassword, type PasswordValidationStatus } from "firebase/auth"

import { useConfig } from "@/components/providers/config-provider"
import { getFirebaseAuth } from "@/lib/firebase"
import { cn } from "@/lib/utils"

type Rule = { label: string; met: boolean }

/** Only the rules the Firebase project's password policy actually enforces (undefined = not required). */
function rulesFrom(status: PasswordValidationStatus): Rule[] {
  const min = status.passwordPolicy.customStrengthOptions.minPasswordLength ?? 6
  const rules: [string, boolean | undefined][] = [
    [`At least ${min} characters`, status.meetsMinPasswordLength],
    ["An uppercase letter", status.containsUppercaseLetter],
    ["A lowercase letter", status.containsLowercaseLetter],
    ["A number", status.containsNumericCharacter],
    ["A special character (e.g. ! @ # $ % -)", status.containsNonAlphanumericCharacter],
  ]
  return rules.filter(([, met]) => met !== undefined).map(([label, met]) => ({ label, met: Boolean(met) }))
}

/**
 * Live checklist against the Firebase project's password policy, so sign-up failures are
 * explained before submitting. Reports validity to the parent via onValidityChange.
 */
export function PasswordRequirements({
  password,
  onValidityChange,
}: {
  password: string
  onValidityChange: (valid: boolean) => void
}) {
  const config = useConfig()
  const [rules, setRules] = useState<Rule[]>([])

  useEffect(() => {
    let cancelled = false
    validatePassword(getFirebaseAuth(config), password)
      .then((status) => {
        if (cancelled) return
        setRules(rulesFrom(status))
        onValidityChange(status.isValid)
      })
      // The policy could not be fetched (e.g. offline): let the server decide.
      .catch(() => !cancelled && onValidityChange(true))
    return () => {
      cancelled = true
    }
  }, [config, password, onValidityChange])

  if (rules.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 text-xs" aria-label="Password requirements">
      {rules.map((rule) => (
        <li
          key={rule.label}
          className={cn("flex items-center gap-1.5", rule.met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}
        >
          {rule.met ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
          {rule.label}
        </li>
      ))}
    </ul>
  )
}
