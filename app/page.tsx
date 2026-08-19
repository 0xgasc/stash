import Link from 'next/link'
import { ArrowRight, Lock, Globe, Infinity, Upload, Zap, FolderOpen, Eye } from 'lucide-react'
import HomeUploadHero from './components/HomeUploadHero'
import NavBar from './components/NavBar'

export default function Home() {
  return (
    <div className="min-h-screen bg-black scanlines">
      <NavBar />

      {/* Hero */}
      <main className="container mx-auto px-4 pt-16 pb-8 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">
            Your files.<br />
            <span className="text-accent-cyan text-glow">Forever.</span>
          </h1>
          <p className="text-gray-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Upload any file and get a permanent link. Stored on the blockchain —
            no subscriptions, no deletions, no expiration. Ever.
          </p>
        </div>

        <HomeUploadHero />

        <p className="text-center text-gray-600 text-xs mt-4 tracking-wide">
          No account needed &middot; Up to 6GB per file &middot; Any format
        </p>
      </main>

      {/* The problem */}
      <section className="container mx-auto px-4 py-24 relative z-10">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 text-center tracking-tight">
            Cloud storage has an expiration date.
          </h2>
          <p className="text-gray-400 text-center max-w-xl mx-auto mb-16 text-sm leading-relaxed">
            Google Drive deletes inactive accounts. Dropbox links break when you cancel.
            WeTransfer expires in 7 days. Your files deserve better.
          </p>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="border border-gray-800 p-6 hover:border-accent-cyan/30 transition-colors group">
              <Infinity className="w-6 h-6 text-accent-cyan mb-4 group-hover:text-glow transition-all" />
              <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-2">Permanent</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Stored on Arweave — a decentralized network designed to last 200+ years. Not a promise, a protocol.
              </p>
            </div>
            <div className="border border-gray-800 p-6 hover:border-accent-green/30 transition-colors group">
              <Lock className="w-6 h-6 text-accent-green mb-4" />
              <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-2">Immutable</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Once uploaded, nobody can alter or delete your file. Not us, not anyone. It&apos;s math, not trust.
              </p>
            </div>
            <div className="border border-gray-800 p-6 hover:border-accent-blue/30 transition-colors group">
              <Globe className="w-6 h-6 text-accent-blue mb-4" />
              <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-2">Decentralized</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                No single server. Your files live across a global network. If one node goes down, the rest keep serving.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container mx-auto px-4 py-24 relative z-10 border-t border-gray-900">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-16 text-center tracking-tight">
            Three steps. That&apos;s it.
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-accent-cyan flex items-center justify-center mx-auto mb-4">
                <Upload className="w-5 h-5 text-accent-cyan" />
              </div>
              <div className="text-accent-cyan text-xs font-bold uppercase tracking-widest mb-2">01</div>
              <h3 className="text-white font-bold text-sm mb-2">Upload</h3>
              <p className="text-gray-500 text-xs leading-relaxed">
                Drag and drop any file. Images, videos, audio, documents, archives — anything up to 6GB.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-accent-cyan flex items-center justify-center mx-auto mb-4">
                <Zap className="w-5 h-5 text-accent-cyan" />
              </div>
              <div className="text-accent-cyan text-xs font-bold uppercase tracking-widest mb-2">02</div>
              <h3 className="text-white font-bold text-sm mb-2">Stored on-chain</h3>
              <p className="text-gray-500 text-xs leading-relaxed">
                Your file is uploaded to Arweave via Irys. Permanent, decentralized, and verifiable on the blockchain.
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-accent-cyan flex items-center justify-center mx-auto mb-4">
                <Eye className="w-5 h-5 text-accent-cyan" />
              </div>
              <div className="text-accent-cyan text-xs font-bold uppercase tracking-widest mb-2">03</div>
              <h3 className="text-white font-bold text-sm mb-2">Share the link</h3>
              <p className="text-gray-500 text-xs leading-relaxed">
                Get a permanent URL with an inline viewer. Images, videos, and audio play right in the browser.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="container mx-auto px-4 py-24 relative z-10 border-t border-gray-900">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-16 text-center tracking-tight">
            Built for people who care about their files.
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="border border-gray-800 p-6">
              <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-2">Creators</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Portfolio links that never break. Share music, art, and video knowing the URL will work in 10 years.
              </p>
            </div>
            <div className="border border-gray-800 p-6">
              <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-2">Developers</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                API access for programmatic uploads. Store assets, backups, and build artifacts permanently.
              </p>
            </div>
            <div className="border border-gray-800 p-6">
              <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-2">Archivists</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Preserve documents, records, and cultural artifacts on an immutable network. No server to maintain.
              </p>
            </div>
            <div className="border border-gray-800 p-6">
              <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-2">Anyone</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Share a file with someone and know the link will still work. No sign-up wall, no &ldquo;link expired&rdquo; page.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="container mx-auto px-4 py-24 relative z-10 border-t border-gray-900">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 tracking-tight">
            Free to start. Pay to scale.
          </h2>
          <p className="text-gray-400 text-sm mb-8 max-w-lg mx-auto leading-relaxed">
            Upload for free with no account. Create an account for 3 uploads/day.
            Need more? Plans start at $9/month with unlimited uploads and folder organization.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 bg-accent-cyan hover:bg-cyan-300 text-black font-bold py-3 px-8 transition-colors uppercase tracking-wider text-sm"
            >
              See plans <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center gap-2 border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white font-bold py-3 px-8 transition-colors uppercase tracking-wider text-sm"
            >
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* Features strip */}
      <section className="container mx-auto px-4 py-16 relative z-10 border-t border-gray-900">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-xs text-gray-500 uppercase tracking-wider">
            <div className="border border-gray-800/50 p-4">
              <FolderOpen className="w-4 h-4 text-gray-600 mx-auto mb-2" />
              Folders &amp; collections
            </div>
            <div className="border border-gray-800/50 p-4">
              <Eye className="w-4 h-4 text-gray-600 mx-auto mb-2" />
              Inline media viewer
            </div>
            <div className="border border-gray-800/50 p-4">
              <Lock className="w-4 h-4 text-gray-600 mx-auto mb-2" />
              Password protection
            </div>
            <div className="border border-gray-800/50 p-4">
              <Globe className="w-4 h-4 text-gray-600 mx-auto mb-2" />
              Public archive pages
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-12 border-t border-gray-900 relative z-10">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-gray-600 tracking-wide">
          <div className="uppercase">Powered by Arweave &amp; Irys</div>
          <div className="flex gap-6">
            <Link href="/about" className="hover:text-accent-cyan transition-colors">About</Link>
            <Link href="/pricing" className="hover:text-accent-cyan transition-colors">Pricing</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
