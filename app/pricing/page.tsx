/**
 * /pricing — Pricing tiers, comparison table, and FAQ.
 *
 * Shows Free (50GB testnet) and Permanent ($0.50/GB Arweave) tiers,
 * example pricing, a comparison table vs Google Drive and Dropbox,
 * and frequently asked questions.
 */
import Link from 'next/link'
import { Check } from 'lucide-react'

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex justify-between items-center">
          <Link href="/" className="text-xl font-medium text-white">
            Stash
          </Link>
          <div className="flex items-center gap-6 text-sm">
            <Link href="/" className="text-gray-400 hover:text-white">
              Upload
            </Link>
            <Link href="/dashboard" className="text-gray-400 hover:text-white">
              Dashboard
            </Link>
          </div>
        </nav>
      </header>

      {/* Pricing Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-3xl font-medium text-white mb-3">
            Pricing
          </h1>
          <p className="text-gray-400 max-w-lg mx-auto">
            50GB free. $0.50/GB for permanent storage.
          </p>
        </div>

        {/* Pricing Tiers */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-16">
          <PricingCard
            name="Free"
            price="$0"
            period=""
            description="50GB storage"
            features={[
              '50GB storage on testnet',
              'Auto-renews before expiration',
              'All file types supported',
              'Up to 6GB per file',
              'No credit card required'
            ]}
            cta="Start free"
            ctaLink="/"
            popular={false}
          />

          <PricingCard
            name="Permanent"
            price="$0.50"
            period="/GB"
            description="Forever on Arweave"
            features={[
              'Truly permanent (200+ years)',
              'Stored on Arweave blockchain',
              'Uncensorable & decentralized',
              'Up to 6GB per file',
              'Pay once, keep forever'
            ]}
            cta="Go permanent"
            ctaLink="/"
            popular={true}
          />
        </div>

        {/* Pricing Examples */}
        <div className="max-w-2xl mx-auto mb-16 bg-gray-950 p-6 border border-gray-800">
          <h3 className="text-sm font-medium text-white text-center mb-6">Example pricing</h3>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="p-3">
              <div className="text-xl font-medium text-white">$5</div>
              <div className="text-gray-500 text-xs">10GB</div>
            </div>
            <div className="p-3">
              <div className="text-xl font-medium text-white">$25</div>
              <div className="text-gray-500 text-xs">50GB</div>
            </div>
            <div className="p-3">
              <div className="text-xl font-medium text-white">$50</div>
              <div className="text-gray-500 text-xs">100GB</div>
            </div>
            <div className="p-3">
              <div className="text-xl font-medium text-white">$250</div>
              <div className="text-gray-500 text-xs">500GB</div>
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="text-lg font-medium text-white text-center mb-8">
            Compare
          </h2>

          <div className="bg-gray-950 border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black border-b border-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-gray-500 font-medium"></th>
                  <th className="px-6 py-3 text-center text-gray-500 font-medium">Google Drive</th>
                  <th className="px-6 py-3 text-center text-gray-500 font-medium">Dropbox</th>
                  <th className="px-6 py-3 text-center text-white font-medium">Stash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                <tr>
                  <td className="px-6 py-3 text-gray-400">Free storage</td>
                  <td className="px-6 py-3 text-center text-gray-500">15GB</td>
                  <td className="px-6 py-3 text-center text-gray-500">2GB</td>
                  <td className="px-6 py-3 text-center text-white">50GB</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-400">100GB (10 years)</td>
                  <td className="px-6 py-3 text-center text-gray-500">$1,200+</td>
                  <td className="px-6 py-3 text-center text-gray-500">$1,440+</td>
                  <td className="px-6 py-3 text-center text-white">$50</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-400">Duration</td>
                  <td className="px-6 py-3 text-center text-gray-500">Subscription</td>
                  <td className="px-6 py-3 text-center text-gray-500">Subscription</td>
                  <td className="px-6 py-3 text-center text-white">200+ years</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 text-gray-400">Decentralized</td>
                  <td className="px-6 py-3 text-center text-gray-600">No</td>
                  <td className="px-6 py-3 text-center text-gray-600">No</td>
                  <td className="px-6 py-3 text-center text-white">Yes</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-lg font-medium text-white text-center mb-8">
            FAQ
          </h2>

          <div className="space-y-4">
            <FAQItem
              question="How does the free tier work?"
              answer="Your files are stored on the Irys testnet. Before they expire, we automatically re-upload them so you never lose access."
            />
            <FAQItem
              question="What makes permanent storage different?"
              answer="Permanent files are stored on Arweave, a decentralized blockchain designed for 200+ year storage. Once uploaded, they exist forever."
            />
            <FAQItem
              question="Can permanent files be deleted?"
              answer="No. Permanent files on Arweave are truly immutable. Make sure you want something stored eternally before making it permanent."
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-12 mt-24 border-t border-gray-900">
        <div className="flex justify-between items-center text-sm text-gray-600">
          <div>Arweave + Irys</div>
          <div className="flex gap-6">
            <Link href="/" className="hover:text-gray-400">Upload</Link>
            <Link href="/dashboard" className="hover:text-gray-400">Dashboard</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

function PricingCard({
  name,
  price,
  period,
  description,
  features,
  cta,
  ctaLink,
  popular
}: {
  name: string
  price: string
  period: string
  description: string
  features: string[]
  cta: string
  ctaLink: string
  popular: boolean
}) {
  return (
    <div className={`bg-gray-950 p-6 border ${popular ? 'border-white' : 'border-gray-800'}`}>
      <div className="mb-6">
        <h3 className="text-sm font-medium text-white mb-1">{name}</h3>
        <p className="text-gray-500 text-xs mb-4">{description}</p>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-medium text-white">{price}</span>
          {period && <span className="text-gray-500 text-sm">{period}</span>}
        </div>
      </div>

      <ul className="space-y-2 mb-6">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2 text-gray-400 text-sm">
            <Check className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaLink}
        className={`block text-center font-medium py-2 px-4 text-sm ${
          popular
            ? 'bg-white hover:bg-gray-200 text-black'
            : 'bg-gray-900 hover:bg-gray-800 text-white border border-gray-700'
        }`}
      >
        {cta}
      </Link>
    </div>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="bg-gray-950 p-5 border border-gray-800">
      <h3 className="text-sm font-medium text-white mb-2">{question}</h3>
      <p className="text-gray-500 text-sm">{answer}</p>
    </div>
  )
}
