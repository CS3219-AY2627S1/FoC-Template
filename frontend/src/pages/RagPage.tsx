import { useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { askRag } from '../features/rag/rag.api'

const suggestedQuestions = [
  'How are credits transferred to a courier?',
  'What information must I provide when creating an errand?',
  'Can a requester accept their own errand?',
]

export function RagPage() {
  const [question, setQuestion] = useState('')
  const [submittedQuestion, setSubmittedQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = question.trim()
    if (!value || loading) return

    setLoading(true)
    setError('')
    setAnswer('')
    setSubmittedQuestion(value)
    try {
      const result = await askRag(value)
      setAnswer(result.answer)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to contact the assistant.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-3xl">
      <header>
        <p className="text-sm font-semibold text-[#175c45]">Campus Couriers support</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">Ask the assistant</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#68736c]">
          Get quick answers about requesting errands, delivering items, and using platform credits.
        </p>
      </header>

      <div className="mt-6 overflow-hidden rounded-[18px] border border-[#dde3de] bg-white shadow-sm">
        <div className="border-b border-[#dde3de] bg-[#f7faf7] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#175c45] text-lg text-white" aria-hidden="true">✦</span>
            <div>
              <h2 className="font-medium">Campus Couriers assistant</h2>
              <p className="text-xs text-[#68736c]">Ask a question about the application</p>
            </div>
          </div>
        </div>

        <div className="min-h-72 space-y-4 p-5 sm:p-6">
          {!submittedQuestion && !loading && !error ? (
            <div className="rounded-2xl bg-[#f0f3f1] px-4 py-3 text-sm leading-6 text-[#53645a]">
              Hi! I can help answer frequently asked questions about Campus Couriers.
            </div>
          ) : null}
          {submittedQuestion ? <div className="ml-auto w-fit max-w-[88%] rounded-2xl bg-[#175c45] px-4 py-3 text-sm leading-6 text-white">{submittedQuestion}</div> : null}
          {loading ? <div className="w-fit rounded-2xl bg-[#f0f3f1] px-4 py-3 text-sm text-[#68736c]" aria-live="polite">Thinking…</div> : null}
          {answer ? (
            <div className="max-w-[88%] rounded-2xl bg-[#f0f3f1] px-4 py-3 text-sm leading-6 text-[#17211d]">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                  code: ({ children }) => <code className="rounded bg-white/70 px-1 py-0.5 text-[0.9em]">{children}</code>,
                }}
              >
                {answer}
              </ReactMarkdown>
            </div>
          ) : null}
          {error ? <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{error}</div> : null}
        </div>

        <form className="border-t border-[#dde3de] p-4 sm:p-5" onSubmit={submit}>
          <label htmlFor="rag-question" className="sr-only">Ask a question</label>
          <div className="flex gap-2">
            <input id="rag-question" value={question} onChange={(event) => setQuestion(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-[#bdc8c0] px-3 py-2.5 text-sm outline-none focus:border-[#175c45] focus:ring-2 focus:ring-[#d8f06b]" placeholder="Ask a question…" disabled={loading} />
            <button type="submit" disabled={!question.trim() || loading} className="rounded-lg bg-[#175c45] px-4 text-sm font-semibold text-white transition hover:bg-[#0d3c2d] disabled:cursor-not-allowed disabled:opacity-50">Ask</button>
          </div>
        </form>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#68736c]">Try asking</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestedQuestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)} className="rounded-full border border-[#cbd8ce] bg-white px-3.5 py-2 text-left text-xs text-[#53645a] transition hover:border-[#175c45] hover:text-[#175c45]">{suggestion}</button>)}
        </div>
      </div>
    </section>
  )
}
