import Link from 'next/link'
import HomeUploadHero from './components/HomeUploadHero'
import NavBar from './components/NavBar'

export default function Home() {
  return (
    <div className="min-h-screen bg-black scanlines">
      <NavBar />

      {/* Hero */}
      <main className="container mx-auto px-4 py-24 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Upload. Get a link.
          </h1>
          <p className="text-gray-400 text-sm tracking-wide">
            Files stored on the blockchain. No sign-up required.
          </p>
        </div>

        <HomeUploadHero />

        {/* Brief info */}
        <div className="max-w-2xl mx-auto mt-24">
          <div className="grid grid-cols-3 gap-6 text-center text-xs tracking-wide">
            <div className="border border-gray-800 p-4 hover:border-accent-green/30 transition-colors">
              <div className="text-accent-green mb-1 font-bold uppercase">Permanent</div>
              <div className="text-gray-400">Stored on-chain</div>
            </div>
            <div className="border border-gray-800 p-4 hover:border-accent-blue/30 transition-colors">
              <div className="text-accent-blue mb-1 font-bold uppercase">Decentralized</div>
              <div className="text-gray-400">No single point of failure</div>
            </div>
            <div className="border border-gray-800 p-4 hover:border-accent-orange/30 transition-colors">
              <div className="text-accent-orange mb-1 font-bold uppercase">Simple</div>
              <div className="text-gray-400">Upload, get a link</div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-12 mt-24 border-t border-gray-900 relative z-10">
        <div className="flex justify-between items-center text-xs text-gray-500 tracking-wide">
          <div className="uppercase">Powered by the blockchain</div>
          <div className="flex gap-6">
            <Link href="/pricing" className="hover:text-accent-cyan transition-colors">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
