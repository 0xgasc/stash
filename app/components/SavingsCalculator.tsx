/**
 * SavingsCalculator — Interactive cost comparison tool.
 *
 * Lets users input storage size and time period, then compares
 * the cumulative cost of Google Drive, Dropbox, and OneDrive
 * against Stash's one-time permanent storage fee ($0.50/GB).
 */
'use client'

import { useState } from 'react'

export default function SavingsCalculator() {
  const [storageGB, setStorageGB] = useState(100)
  const [years, setYears] = useState(10)
  const [selectedProvider, setSelectedProvider] = useState<'google' | 'dropbox' | 'onedrive'>('google')

  // Competitor pricing (per month for different storage tiers)
  const competitorPricing = {
    google: [
      { gb: 15, price: 0 },
      { gb: 100, price: 1.99 },
      { gb: 200, price: 2.99 },
      { gb: 2000, price: 9.99 }
    ],
    dropbox: [
      { gb: 2, price: 0 },
      { gb: 2000, price: 11.99 },
      { gb: 3000, price: 19.99 }
    ],
    onedrive: [
      { gb: 5, price: 0 },
      { gb: 100, price: 1.99 },
      { gb: 1000, price: 6.99 }
    ]
  }

  // Find the right tier for the selected storage amount
  const getCompetitorCost = () => {
    const tiers = competitorPricing[selectedProvider]
    const tier = tiers.find(t => storageGB <= t.gb) || tiers[tiers.length - 1]
    const monthlyPrice = tier.price
    return monthlyPrice * 12 * years
  }

  // Stash pricing (one-time permanent at $0.50/GB)
  const getStashCost = () => {
    if (storageGB <= 50) return 0 // Free tier: 50GB free
    // Permanent storage: $0.50/GB for storage above 50GB
    return (storageGB - 50) * 0.5
  }

  const competitorTotal = getCompetitorCost()
  const stashCost = getStashCost()
  const savings = competitorTotal - stashCost
  const savingsPercent = competitorTotal > 0 ? ((savings / competitorTotal) * 100).toFixed(0) : 0

  const providerNames = {
    google: 'Google Drive',
    dropbox: 'Dropbox',
    onedrive: 'OneDrive'
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="bg-gray-950 p-8 border border-gray-800">
        {/* Inputs */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Storage Amount */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">
              Storage amount
            </label>
            <div className="space-y-3">
              <input
                type="range"
                min="1"
                max="1000"
                value={storageGB}
                onChange={(e) => setStorageGB(Number(e.target.value))}
                className="w-full h-1 bg-gray-800 appearance-none cursor-pointer"
              />
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={storageGB}
                  onChange={(e) => setStorageGB(Number(e.target.value))}
                  className="flex-1 bg-black text-white px-4 py-2 border border-gray-700 focus:border-gray-600 focus:outline-none text-sm"
                  min="1"
                  max="10000"
                />
                <span className="text-gray-400 text-sm">GB</span>
              </div>
            </div>
          </div>

          {/* Time Period */}
          <div>
            <label className="block text-xs text-gray-500 mb-2">
              Time period
            </label>
            <div className="space-y-3">
              <input
                type="range"
                min="1"
                max="20"
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
                className="w-full h-1 bg-gray-800 appearance-none cursor-pointer"
              />
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={years}
                  onChange={(e) => setYears(Number(e.target.value))}
                  className="flex-1 bg-black text-white px-4 py-2 border border-gray-700 focus:border-gray-600 focus:outline-none text-sm"
                  min="1"
                  max="50"
                />
                <span className="text-gray-400 text-sm">years</span>
              </div>
            </div>
          </div>
        </div>

        {/* Provider Selection */}
        <div className="mb-8">
          <label className="block text-xs text-gray-500 mb-2">
            Compare against
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['google', 'dropbox', 'onedrive'] as const).map((provider) => (
              <button
                key={provider}
                onClick={() => setSelectedProvider(provider)}
                className={`py-2 px-3 text-sm transition-all ${
                  selectedProvider === provider
                    ? 'bg-white text-black'
                    : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-700'
                }`}
              >
                {providerNames[provider]}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {/* Competitor Cost */}
          <div className="bg-black p-5 border border-gray-800">
            <div className="text-xs text-gray-500 mb-1">{providerNames[selectedProvider]}</div>
            <div className="text-2xl font-medium text-gray-400 mb-1">
              ${competitorTotal.toLocaleString()}
            </div>
            <p className="text-xs text-gray-600">
              Over {years} years
            </p>
          </div>

          {/* Stash Cost */}
          <div className="bg-black p-5 border border-white">
            <div className="text-xs text-gray-500 mb-1">Stash</div>
            <div className="text-2xl font-medium text-white mb-1">
              ${stashCost.toLocaleString()}
            </div>
            <p className="text-xs text-gray-600">
              One-time, forever
            </p>
          </div>
        </div>

        {/* Savings Highlight */}
        <div className="bg-black border border-gray-800 p-6 text-center">
          <div className="text-xs text-gray-500 mb-2">You save</div>
          <div className="text-4xl font-medium text-white mb-1">
            ${savings.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">
            {savingsPercent}% savings
          </div>
        </div>

        {/* CTA */}
        <div className="mt-6 text-center">
          <a
            href="/"
            className="inline-block bg-white hover:bg-gray-200 text-black font-medium px-6 py-2 text-sm transition-colors"
          >
            Start uploading
          </a>
        </div>
      </div>
    </div>
  )
}
