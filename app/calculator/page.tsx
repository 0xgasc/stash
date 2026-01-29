import SavingsCalculator from '../components/SavingsCalculator'
import Link from 'next/link'

export default function CalculatorPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <Link href="/" className="text-xl font-medium text-white">
            Stash
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/pricing" className="text-gray-400 hover:text-white">
              Pricing
            </Link>
            <Link href="/dashboard" className="text-gray-400 hover:text-white">
              Dashboard
            </Link>
            <Link href="/" className="bg-white hover:bg-gray-200 text-black px-4 py-2 font-medium">
              Upload
            </Link>
          </div>
        </nav>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-medium text-white mb-3">
            Calculator
          </h1>
          <p className="text-gray-400 max-w-lg mx-auto">
            Compare Stash permanent storage against traditional cloud providers
          </p>
        </div>

        <SavingsCalculator />

        {/* Why Permanent Storage */}
        <div className="max-w-3xl mx-auto mt-16 bg-gray-950 p-8 border border-gray-800">
          <h2 className="text-lg font-medium text-white text-center mb-8">
            Why permanent storage
          </h2>

          <div className="grid md:grid-cols-2 gap-8 text-sm">
            <div>
              <h3 className="text-white font-medium mb-3">
                Traditional cloud
              </h3>
              <ul className="space-y-2 text-gray-500">
                <li>Monthly fees forever</li>
                <li>Price increases over time</li>
                <li>Can delete your files</li>
                <li>Account can be banned</li>
                <li>Company could shut down</li>
              </ul>
            </div>

            <div>
              <h3 className="text-white font-medium mb-3">
                Permanent storage
              </h3>
              <ul className="space-y-2 text-gray-400">
                <li>One-time payment</li>
                <li>Price locked forever</li>
                <li>Files cannot be deleted</li>
                <li>Decentralized</li>
                <li>200+ year guarantee</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/pricing"
              className="inline-block border border-gray-700 hover:border-gray-600 text-gray-400 hover:text-white px-6 py-2 text-sm"
            >
              View pricing
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-12 mt-24 border-t border-gray-900">
        <div className="flex justify-between items-center text-sm text-gray-600">
          <div>Arweave + Irys</div>
          <div className="flex gap-6">
            <Link href="/pricing" className="hover:text-gray-400">Pricing</Link>
            <Link href="/dashboard" className="hover:text-gray-400">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
