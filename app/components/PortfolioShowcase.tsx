/**
 * PortfolioShowcase — Animated hero showcase with sample file cards.
 *
 * Uses Framer Motion for staggered entrance animations. Displays
 * example permanent uploads (images, documents, audio) as a
 * demonstration of the platform's capabilities.
 */
'use client'

import { motion } from 'framer-motion'

const ease = [0.25, 0.1, 0.25, 1] as const

export default function PortfolioShowcase() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 py-24 relative overflow-hidden">
      {/* Glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2.5 }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/[0.02] rounded-full blur-[120px]" />
      </motion.div>

      <div className="max-w-5xl w-full relative z-10">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease }}
        >
          <h1
            className="text-white font-medium tracking-tight leading-none mb-3"
            style={{ fontSize: 'clamp(3.5rem, 10vw, 8rem)' }}
          >
            stash
          </h1>

          <p
            className="text-gray-400 mb-6"
            style={{ fontSize: 'clamp(1.125rem, 2.5vw, 1.5rem)' }}
          >
            permanent file storage on arweave
          </p>

          <p className="text-gray-500 text-base max-w-lg mb-10 leading-relaxed">
            decentralized storage that outlasts you. drop a file, get a
            permanent link. 50GB free, then $0.50/GB -- once, not monthly.
          </p>
        </motion.div>

        {/* Feature pills */}
        <div className="flex flex-wrap gap-2 mb-16">
          {['Permanent storage', 'Decentralized', 'One-time payment'].map((feature, i) => (
            <motion.span
              key={feature}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.1, duration: 0.5, ease }}
              className="px-4 py-2 border border-gray-800 text-gray-400 text-sm tracking-tight"
            >
              {feature}
            </motion.span>
          ))}
        </div>

        {/* App preview */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.9, ease }}
          className="relative mb-16"
        >
          <div className="bg-[#050505] border border-gray-800 relative overflow-hidden">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-800/60">
              <div className="w-2.5 h-2.5 bg-gray-800" />
              <div className="w-2.5 h-2.5 bg-gray-800" />
              <div className="w-2.5 h-2.5 bg-gray-800" />
              <div className="ml-4 flex-1 h-5 bg-gray-900/50 max-w-xs" />
            </div>

            {/* Fake app content */}
            <div className="p-8">
              {/* Nav */}
              <div className="flex justify-between items-center mb-12">
                <div className="text-white text-sm font-medium">Stash</div>
                <div className="flex gap-6">
                  <div className="h-2 bg-gray-800 w-14" />
                  <div className="h-2 bg-gray-800 w-12" />
                  <div className="h-2 bg-gray-800 w-16" />
                </div>
              </div>

              {/* Hero text */}
              <div className="text-center max-w-sm mx-auto mb-8">
                <div className="h-4 bg-gray-700 w-3/4 mx-auto mb-3" />
                <div className="h-2 bg-gray-800 w-2/3 mx-auto" />
              </div>

              {/* Upload zone */}
              <div className="max-w-md mx-auto">
                <div className="h-28 bg-black border border-dashed border-gray-700 flex flex-col items-center justify-center gap-2 mb-6">
                  <div className="w-8 h-8 border border-gray-700 flex items-center justify-center">
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="square" d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
                    </svg>
                  </div>
                  <span className="text-gray-600 text-xs">Drop file or click to upload</span>
                </div>

                {/* Stats row */}
                <div className="flex justify-center gap-10">
                  <div className="text-center">
                    <div className="text-white text-sm font-medium">50GB</div>
                    <div className="text-gray-600 text-[10px] mt-0.5">Free</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white text-sm font-medium">$0.50</div>
                    <div className="text-gray-600 text-[10px] mt-0.5">Per GB</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white text-sm font-medium">200+</div>
                    <div className="text-gray-600 text-[10px] mt-0.5">Years</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Fade overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
          </div>
        </motion.div>

        {/* Architecture */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="grid grid-cols-3 gap-px bg-gray-800 border border-gray-800 mb-16"
        >
          <div className="bg-black p-6">
            <div className="text-gray-600 text-xs uppercase tracking-wider mb-3">Upload</div>
            <div className="text-white text-sm mb-1">Drag and drop</div>
            <div className="text-gray-500 text-xs">Up to 6GB, any format</div>
          </div>
          <div className="bg-black p-6">
            <div className="text-gray-600 text-xs uppercase tracking-wider mb-3">Store</div>
            <div className="text-white text-sm mb-1">Arweave network</div>
            <div className="text-gray-500 text-xs">200+ year guarantee</div>
          </div>
          <div className="bg-black p-6">
            <div className="text-gray-600 text-xs uppercase tracking-wider mb-3">Access</div>
            <div className="text-white text-sm mb-1">Permanent URL</div>
            <div className="text-gray-500 text-xs">No account required</div>
          </div>
        </motion.div>

        {/* Bottom row: tech + links */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.5 }}
          className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6"
        >
          <div className="flex items-center gap-6 text-sm">
            <span className="text-gray-600">Built with</span>
            <div className="flex gap-4 text-gray-500">
              <span>Next.js</span>
              <span className="text-gray-700">|</span>
              <span>Irys</span>
              <span className="text-gray-700">|</span>
              <span>Arweave</span>
              <span className="text-gray-700">|</span>
              <span>Supabase</span>
            </div>
          </div>

          <div className="flex gap-4 text-sm">
            <a href="/" className="text-gray-500 hover:text-white transition-colors border-b border-gray-800 hover:border-gray-500 pb-0.5">
              Live app
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
