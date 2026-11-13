// AI Assistance Disclosure:
// Tool: ChatGPT (model: GPT-5.6 Luna), date: 2026-09-29
// Scope: Generated initial implementation, decomposed App.tsx into separate components
// Author review: I validated correctness and edited for style.

export function EmailField({
  value,
  onChange,
  required = true,
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <label>
      Email
      <input
        type="email"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="email"
        required={required}
      />
    </label>
  )
}
