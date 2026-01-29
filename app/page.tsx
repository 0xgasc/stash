import Link from 'next/link'
import { Shield, Zap, Infinity } from 'lucide-react'
import HomeUploadHero from './components/HomeUploadHero'

export default function Home() {
  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <Link href="/" className="text-xl font-medium text-white">
            Stash
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/calculator" className="text-gray-400 hover:text-white">
              Calculator
            </Link>
            <Link href="/pricing" className="text-gray-400 hover:text-white">
              Pricing
            </Link>
            <Link href="/dashboard" className="text-gray-400 hover:text-white">
              Dashboard
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-24">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-medium text-white mb-4 tracking-tight">
            Store files forever
          </h1>
          <p className="text-lg text-gray-400">
            50GB free. $0.50/GB for permanent storage.
          </p>
        </div>

        <HomeUploadHero />

        {/* Stats */}
        <div className="flex justify-center gap-12 mt-16 text-center">
          <div>
            <div className="text-2xl font-medium text-white">50GB</div>
            <div className="text-sm text-gray-500">Free</div>
          </div>
          <div>
            <div className="text-2xl font-medium text-white">$0.50</div>
            <div className="text-sm text-gray-500">Per GB</div>
          </div>
          <div>
            <div className="text-2xl font-medium text-white">200+</div>
            <div className="text-sm text-gray-500">Years</div>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-32 max-w-4xl mx-auto">
          <div>
            <Infinity className="w-5 h-5 text-gray-400 mb-3" />
            <h3 className="text-white font-medium mb-2">Permanent</h3>
            <p className="text-gray-500 text-sm">
              Stored on Arweave. 200+ years.
            </p>
          </div>
          <div>
            <Shield className="w-5 h-5 text-gray-400 mb-3" />
            <h3 className="text-white font-medium mb-2">Uncensorable</h3>
            <p className="text-gray-500 text-sm">
              Decentralized. No takedowns.
            </p>
          </div>
          <div>
            <Zap className="w-5 h-5 text-gray-400 mb-3" />
            <h3 className="text-white font-medium mb-2">One-time</h3>
            <p className="text-gray-500 text-sm">
              Pay once. No subscriptions.
            </p>
          </div>
        </div>

        {/* Comparison */}
        <div className="mt-32 max-w-3xl mx-auto">
          <h2 className="text-xl font-medium text-white text-center mb-12">
            Compare
          </h2>
          <div className="grid grid-cols-3 gap-6 text-center text-sm">
            <div className="p-6">
              <div className="text-gray-500 mb-4">Google Drive</div>
              <div className="text-gray-400">15GB free</div>
              <div className="text-gray-400">$1.99/mo</div>
              <div className="text-gray-500 mt-2">$240 / 10 years</div>
            </div>
            <div className="p-6 border border-gray-800">
              <div className="text-white mb-4">Stash</div>
              <div className="text-gray-300">50GB free</div>
              <div className="text-gray-300">$50 once</div>
              <div className="text-white mt-2">$50 total</div>
            </div>
            <div className="p-6">
              <div className="text-gray-500 mb-4">Dropbox</div>
              <div className="text-gray-400">2GB free</div>
              <div className="text-gray-400">$11.99/mo</div>
              <div className="text-gray-500 mt-2">$1,440 / 10 years</div>
            </div>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-32 max-w-2xl mx-auto">
          <h2 className="text-xl font-medium text-white text-center mb-12">
            How it works
          </h2>
          <div className="grid grid-cols-3 gap-8 text-center text-sm">
            <div>
              <div className="text-gray-500 mb-2">1</div>
              <div className="text-white mb-1">Upload</div>
              <div className="text-gray-500">Drop your file</div>
            </div>
            <div>
              <div className="text-gray-500 mb-2">2</div>
              <div className="text-white mb-1">Get link</div>
              <div className="text-gray-500">Sign in to save</div>
            </div>
            <div>
              <div className="text-gray-500 mb-2">3</div>
              <div className="text-white mb-1">Go permanent</div>
              <div className="text-gray-500">$0.50/GB forever</div>
            </div>
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
