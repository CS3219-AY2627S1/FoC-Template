// AI-assisted (Claude Opus 5.5), 2026-11-12: show/hide toggle for password fields; see ui/ai-usage/usage-log.md, entry 002
import { useState } from "react"

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">

// Same as a normal password input, plus an eye button to peek at what you typed
export default function PasswordInput({ className = "", ...props }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input {...props} type={visible ? "text" : "password"} className={`${className} pr-10`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[#9CA3AF] hover:text-[#1A4A36]"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {visible ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c4.5 0 8.3 2.9 9.5 7a9.9 9.9 0 01-2.4 3.9M6.6 6.6A9.9 9.9 0 002.5 12c1.2 4.1 5 7 9.5 7 1.9 0 3.6-.5 5.1-1.4" />
          ) : (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12C3.7 7.9 7.5 5 12 5s8.3 2.9 9.5 7c-1.2 4.1-5 7-9.5 7s-8.3-2.9-9.5-7z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  )
}
