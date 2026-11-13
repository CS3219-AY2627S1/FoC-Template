interface Props {
  email: string
  message: string
  onContinue: () => void
  onBack: () => void
}

export default function OtpSentPage({ email, message, onContinue, onBack }: Props) {
  return (
    <div className="min-h-screen bg-[#F7F9F8] flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white border border-[#E4E8E6] rounded-2xl p-8 shadow-sm">
        <h2 className="text-xl font-semibold text-[#162A46] mb-1">OTP sent</h2>
        <p className="text-sm text-[#3F6B5A] mb-4">{message || "OTP sent"}</p>
        <p className="text-sm text-[#1B2522] mb-6">
          Check the inbox for <span className="font-medium">{email || "your account email"}</span>. The code is 6 digits and expires in 2 minutes.
        </p>
        <button
          onClick={onContinue}
          className="w-full py-2.5 bg-[#1A4A36] text-white text-sm font-medium rounded-lg hover:bg-[#163D2C]"
        >
          Enter code
        </button>
        <button
          onClick={onBack}
          className="w-full mt-3 py-2.5 border border-[#E4E8E6] text-sm font-medium rounded-lg text-[#1B2522] hover:bg-[#F7F9F8]"
        >
          Back
        </button>
      </div>
    </div>
  )
}
