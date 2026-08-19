'use client'

import NavBar from './components/NavBar'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-black">
      <NavBar />
      <main className="container mx-auto px-4 py-24 max-w-2xl text-center">
        <p className="text-accent-red text-6xl font-bold mb-4">ERR</p>
        <p className="text-gray-400 text-lg mb-8">Something broke. Try again.</p>
        <button
          onClick={reset}
          className="inline-block px-6 py-3 border border-accent-cyan text-accent-cyan text-sm font-bold hover:bg-accent-cyan/10 transition-all"
        >
          Retry
        </button>
      </main>
    </div>
  )
}
