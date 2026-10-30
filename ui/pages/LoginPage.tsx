import React, { useState } from "react"
import type { Page } from "../App"
import { login } from "../api/users"

interface Props {
  notice?: string  // e.g. after signing up
  onLogin: () => void
  onNavigate: (page: Page) => void
}

export default function LoginPage({ notice, onLogin, onNavigate }: Props) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const { token } = await login(email, password)
      localStorage.setItem("token", token)
      onLogin()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.")
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    "w-full px-3.5 py-2.5 border border-[#E4E8E6] rounded-lg text-sm text-[#1B2522] placeholder-[#9CA3AF] bg-white focus:outline-none focus:border-[#1A4A36] focus:ring-1 focus:ring-[#1A4A36] transition-colors"

  return (
    <div className="min-h-screen bg-white flex">
      {/* Left panel — desktop only */}
      <div className="hidden lg:flex flex-col justify-between w-[400px] flex-shrink-0 bg-[#1A4A36] p-10">
        <div>
          <div className="flex items-center gap-2 mb-16">
            <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-semibold text-white text-base">CampusDash</span>
          </div>
          <h1 className="text-[2rem] font-semibold text-white leading-snug mb-4">
            Campus errands,<br />made easier.
          </h1>
          <p className="text-white/55 text-sm leading-relaxed">
            Request items from campus stores and facilities, or earn credits by helping fellow students.
          </p>
          <div className="mt-10 space-y-3">
            {["Request anything on campus", "Earn credits by couriering", "Track every errand in real time"].map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-white/70 text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-white/25 text-xs">CampusDash 2026</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-[#F7F9F8]">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-10">
            <div className="w-8 h-8 bg-[#1A4A36] rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="font-semibold text-[#162A46] text-base">CampusDash</span>
          </div>

          <div className="bg-white border border-[#E4E8E6] rounded-2xl p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-[#162A46] mb-1">Welcome back</h2>
            <p className="text-sm text-[#3F6B5A] mb-7">Sign in to your student account</p>

            <form
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-[#1B2522] mb-1.5">University email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="yourname@u.nus.edu"
                  className={inputCls}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-[#1B2522]">Password</label>
                  <button type="button" className="text-xs text-[#3F6B5A] hover:text-[#1A4A36] transition-colors">
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputCls}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-[#E4E8E6] accent-[#1A4A36]"
                />
                <span className="text-xs text-[#1B2522]">Remember me</span>
              </label>
              {notice && !error && (
                <p className="rounded-lg bg-[#E8F1ED] px-3 py-2 text-xs text-[#1A4A36]">{notice}</p>
              )}
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C] active:scale-[.99] transition-all disabled:opacity-60"
              >
                {loading ? "Logging in…" : "Log in"}
              </button>
            </form>

            <p className="text-center text-xs text-[#3F6B5A] mt-5">
              {"Don't have an account? "}
              <button
                onClick={() => onNavigate("signup")}
                className="text-[#1A4A36] font-semibold hover:underline"
              >
                Create an account
              </button>
            </p>
          </div>

          <p className="text-center text-xs text-[#9CA3AF] mt-6">
            This platform is for registered university students only.
          </p>
        </div>
      </div>
    </div>
  )
}