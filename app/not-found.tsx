import Link from 'next/link'
import NavBar from './components/NavBar'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black">
      <NavBar />
      <main className="container mx-auto px-4 py-24 max-w-2xl text-center">
        <p className="text-accent-cyan text-6xl font-bold mb-4 text-glow">404</p>
        <p className="text-gray-400 text-lg mb-8">This file doesn't exist — or it was never uploaded.</p>
        <Link
          href="/"
          className="inline-block px-6 py-3 border border-accent-cyan text-accent-cyan text-sm font-bold hover:bg-accent-cyan/10 transition-all"
        >
          Go home
        </Link>
      </main>
    </div>
  )
}
