import Link from 'next/link'
import { Shield, Clock, Globe, Server, Lock, Zap } from 'lucide-react'
import { getServerT } from '@/app/lib/i18n/server'

export default async function AboutPage() {
  const { t } = await getServerT(null)

  return (
    <div className="min-h-screen bg-black">
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <Link href="/" className="text-xl font-bold text-accent-cyan text-glow tracking-widest uppercase">
            Stash
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/pricing" className="text-gray-500 hover:text-accent-cyan transition-colors">
              {t('about.nav_pricing')}
            </Link>
            <Link href="/auth" className="text-gray-500 hover:text-accent-cyan transition-colors">
              {t('about.nav_signin')}
            </Link>
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 py-16 max-w-3xl">
        {/* Hero */}
        <div className="text-center mb-20">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
            {t('about.title')}
          </h1>
          <p className="text-gray-400 text-lg max-w-xl mx-auto">
            {t('about.subtitle')}
          </p>
        </div>

        {/* Problem */}
        <section className="mb-20">
          <h2 className="text-sm font-bold text-accent-cyan uppercase tracking-widest mb-6">
            {t('about.problem_title')}
          </h2>
          <div className="space-y-4 text-gray-400 text-sm leading-relaxed">
            <p>{t('about.problem_1')}</p>
            <p>{t('about.problem_2')}</p>
          </div>
        </section>

        {/* How it works */}
        <section className="mb-20">
          <h2 className="text-sm font-bold text-accent-cyan uppercase tracking-widest mb-8">
            {t('about.how_title')}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="bg-gray-950 border border-gray-800 p-5">
              <div className="text-accent-cyan text-xs font-bold uppercase tracking-wider mb-3">01</div>
              <h3 className="text-white text-sm font-medium mb-2">{t('about.how_1_title')}</h3>
              <p className="text-gray-500 text-xs">{t('about.how_1_body')}</p>
            </div>
            <div className="bg-gray-950 border border-gray-800 p-5">
              <div className="text-accent-cyan text-xs font-bold uppercase tracking-wider mb-3">02</div>
              <h3 className="text-white text-sm font-medium mb-2">{t('about.how_2_title')}</h3>
              <p className="text-gray-500 text-xs">{t('about.how_2_body')}</p>
            </div>
            <div className="bg-gray-950 border border-gray-800 p-5">
              <div className="text-accent-cyan text-xs font-bold uppercase tracking-wider mb-3">03</div>
              <h3 className="text-white text-sm font-medium mb-2">{t('about.how_3_title')}</h3>
              <p className="text-gray-500 text-xs">{t('about.how_3_body')}</p>
            </div>
          </div>
        </section>

        {/* Why not Google/Dropbox */}
        <section className="mb-20">
          <h2 className="text-sm font-bold text-accent-cyan uppercase tracking-widest mb-8">
            {t('about.why_title')}
          </h2>
          <div className="space-y-6">
            <Feature
              icon={<Clock className="w-5 h-5" />}
              title={t('about.why_permanent_title')}
              body={t('about.why_permanent_body')}
            />
            <Feature
              icon={<Shield className="w-5 h-5" />}
              title={t('about.why_uncensorable_title')}
              body={t('about.why_uncensorable_body')}
            />
            <Feature
              icon={<Globe className="w-5 h-5" />}
              title={t('about.why_decentralized_title')}
              body={t('about.why_decentralized_body')}
            />
            <Feature
              icon={<Server className="w-5 h-5" />}
              title={t('about.why_no_subscription_title')}
              body={t('about.why_no_subscription_body')}
            />
            <Feature
              icon={<Lock className="w-5 h-5" />}
              title={t('about.why_yours_title')}
              body={t('about.why_yours_body')}
            />
            <Feature
              icon={<Zap className="w-5 h-5" />}
              title={t('about.why_fast_title')}
              body={t('about.why_fast_body')}
            />
          </div>
        </section>

        {/* Tech stack */}
        <section className="mb-20">
          <h2 className="text-sm font-bold text-accent-cyan uppercase tracking-widest mb-6">
            {t('about.tech_title')}
          </h2>
          <div className="bg-gray-950 border border-gray-800 p-6 text-sm text-gray-400 space-y-3">
            <p>{t('about.tech_1')}</p>
            <p>{t('about.tech_2')}</p>
            <p>{t('about.tech_3')}</p>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center py-12 border-t border-gray-900">
          <h2 className="text-2xl font-bold text-white mb-3">
            {t('about.cta_title')}
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            {t('about.cta_subtitle')}
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/"
              className="bg-accent-cyan hover:bg-cyan-300 text-black font-bold py-3 px-8 transition-colors uppercase tracking-wider text-sm"
            >
              {t('about.cta_upload')}
            </Link>
            <Link
              href="/pricing"
              className="border-2 border-gray-700 hover:border-accent-cyan text-gray-400 hover:text-accent-cyan font-bold py-3 px-8 transition-colors uppercase tracking-wider text-sm"
            >
              {t('about.cta_pricing')}
            </Link>
          </div>
        </section>
      </main>

      <footer className="container mx-auto px-4 py-12 border-t border-gray-900">
        <div className="flex justify-between items-center text-sm text-gray-600">
          <div>Arweave + Irys</div>
          <div className="flex gap-6">
            <Link href="/" className="hover:text-gray-400">Upload</Link>
            <Link href="/pricing" className="hover:text-gray-400">{t('about.nav_pricing')}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <div className="text-accent-cyan flex-shrink-0 mt-0.5">{icon}</div>
      <div>
        <h3 className="text-white text-sm font-medium mb-1">{title}</h3>
        <p className="text-gray-500 text-xs leading-relaxed">{body}</p>
      </div>
    </div>
  )
}
