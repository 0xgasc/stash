'use client'

import { motion } from 'framer-motion'

export default function PortfolioShowcase() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="max-w-4xl w-full">
        {/* Glow effect */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2 }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-white/[0.04] rounded-full blur-[120px]" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          className="relative z-10"
        >
          {/* Title */}
          <h1
            className="text-white font-medium tracking-tight mb-4"
            style={{ fontSize: 'clamp(3rem, 8vw, 6rem)' }}
          >
            stash
          </h1>

          {/* Tagline */}
          <p
            className="text-gray-300 mb-8"
            style={{ fontSize: 'clamp(1.25rem, 3vw, 1.75rem)' }}
          >
            store files forever
          </p>

          {/* Description */}
          <p className="text-gray-400 text-lg mb-10 max-w-md">
            50GB free. $0.50/GB for permanent storage on Arweave.
            Pay once, keep forever.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-3 mb-12">
            {['Permanent', 'Uncensorable', 'One-time payment'].map((feature, i) => (
              <motion.span
                key={feature}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
                className="px-4 py-2 border border-gray-700 text-gray-300 text-sm"
              >
                {feature}
              </motion.span>
            ))}
          </div>

          {/* Screenshot/Preview */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="relative mb-12"
          >
            <div className="bg-gray-950 border border-gray-700 p-8 relative overflow-hidden">
              {/* Fake UI preview */}
              <div className="flex items-center gap-2 mb-6">
                <div className="w-3 h-3 rounded-full bg-gray-700" />
                <div className="w-3 h-3 rounded-full bg-gray-700" />
                <div className="w-3 h-3 rounded-full bg-gray-700" />
              </div>
              <div className="space-y-4">
                <div className="h-3 bg-gray-700 w-1/3" />
                <div className="h-20 bg-gray-900 border border-dashed border-gray-600 flex items-center justify-center">
                  <span className="text-gray-500 text-sm">Drop file or click to upload</span>
                </div>
                <div className="flex gap-4">
                  <div className="h-3 bg-gray-700 w-16" />
                  <div className="h-3 bg-gray-700 w-24" />
                </div>
              </div>

              {/* Shadow overlay */}
              <div className="absolute inset-0 shadow-[inset_0_-60px_60px_-60px_rgba(0,0,0,0.8)] pointer-events-none" />
            </div>
          </motion.div>

          {/* Tech stack */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="flex items-center gap-6 text-sm text-gray-500"
          >
            <span>Built with</span>
            <div className="flex gap-4 text-gray-400">
              <span>Arweave</span>
              <span className="text-gray-600">·</span>
              <span>Irys</span>
              <span className="text-gray-600">·</span>
              <span>Next.js</span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
