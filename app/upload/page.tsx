import UploadInterface from '../components/UploadInterface'
import Link from 'next/link'

export default function UploadPage() {
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
          </div>
        </nav>
      </header>

      {/* Main Upload Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-medium text-white mb-3">
            Upload files
          </h1>
          <p className="text-gray-400">
            Store permanently on Arweave
          </p>
        </div>

        <UploadInterface />

        {/* Pricing Info */}
        <div className="max-w-2xl mx-auto mt-12">
          <div className="bg-gray-950 p-6 border border-gray-800">
            <h3 className="text-sm font-medium text-white mb-4">Pricing</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Free tier</span>
                <span className="text-white">50GB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Permanent storage</span>
                <span className="text-white">$0.50/GB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Duration</span>
                <span className="text-white">200+ years</span>
              </div>
            </div>
            <Link
              href="/pricing"
              className="block mt-4 text-center text-gray-500 hover:text-white text-sm"
            >
              View pricing
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
