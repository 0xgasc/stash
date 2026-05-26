import Link from 'next/link'
import HomeUploadHero from './components/HomeUploadHero'
import NavBar from './components/NavBar'

const features = [
  {
    icon: '⟡',
    title: 'Eternal',
    desc: 'Stored on Arweave — immutable, permanent, forever.',
    accent: 'text-accent-gold',
  },
  {
    icon: '⚡',
    title: 'Swift',
    desc: 'Resumable uploads. Large files, no interruptions.',
    accent: 'text-accent-teal',
  },
  {
    icon: '◇',
    title: 'Boundless',
    desc: 'No sign-up. No limits. Just upload and share.',
    accent: 'text-accent-violet',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-background marble relative">
      {/* Ambient caduceus glow in upper region */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-caduceus pointer-events-none z-0"
        aria-hidden="true"
      />

      <NavBar />

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <main className="container mx-auto px-4 pt-20 pb-16 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-20">
          {/* Epithet line */}
          <p className="text-accent-gold/50 text-xs tracking-[0.3em] uppercase mb-6 animate-flicker font-serif italic">
            Swift messenger · Keeper of paths
          </p>

          <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-light text-foreground mb-6 tracking-tight leading-tight">
            Upload.
            <br />
            <span className="text-accent-gold text-gold">Get a link.</span>
          </h1>

          <p className="text-foreground/40 text-sm tracking-wide max-w-md mx-auto">
            Files stored on the blockchain. No account needed.
            <br />
            Permanent as carved marble.
          </p>
        </div>

        {/* ── Upload Zone ─────────────────────────────────────────── */}
        <HomeUploadHero />

        {/* ── Meander divider ─────────────────────────────────────── */}
        <div className="max-w-2xl mx-auto mt-28 mb-20">
          <div className="meander" />
        </div>

        {/* ── Features grid ──────────────────────────────────────── */}
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="card-surface group p-6 text-center transition-all duration-300"
              >
                <div className={`text-2xl mb-3 ${f.accent} group-hover:scale-110 transition-transform duration-300`}>
                  {f.icon}
                </div>
                <h3 className={`font-serif text-lg font-medium mb-2 ${f.accent}`}>
                  {f.title}
                </h3>
                <p className="text-foreground/30 text-xs leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="container mx-auto px-4 py-12 border-t border-surface-border relative z-10">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-foreground/25 tracking-widest uppercase">
            <span className="text-accent-gold/40">⚚</span>
            <span>Powered by the blockchain</span>
          </div>

          <div className="flex gap-8 text-xs tracking-wider uppercase">
            <Link
              href="/pricing"
              className="text-foreground/30 hover:text-accent-gold transition-colors duration-300"
            >
              Pricing
            </Link>
            <Link
              href="/showcase"
              className="text-foreground/30 hover:text-accent-gold transition-colors duration-300"
            >
              Showcase
            </Link>
            <a
              href="https://github.com/0xgasc/stash"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/30 hover:text-accent-gold transition-colors duration-300"
            >
              Source
            </a>
          </div>
        </div>

        {/* Epithet closing */}
        <div className="text-center mt-6">
          <p className="text-foreground/10 text-[10px] tracking-[0.4em] uppercase font-serif italic">
            Ἑρμῆς · ψυχοπομπός
          </p>
        </div>
      </footer>
    </div>
  )
}