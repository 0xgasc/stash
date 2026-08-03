'use client'

import { useState, useRef } from 'react'
import { Play, Loader2 } from 'lucide-react'

export default function VideoPlayer({ src, size }: { src: string; size: number }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready'>('idle')
  const videoRef = useRef<HTMLVideoElement>(null)
  const sizeMB = size / 1024 / 1024

  function handlePlay() {
    setState('loading')
    const video = videoRef.current
    if (!video) return
    video.src = src
    video.load()
  }

  function handleCanPlay() {
    setState('ready')
    videoRef.current?.play()
  }

  if (state === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-4 min-h-[300px]">
        <button
          onClick={handlePlay}
          className="w-20 h-20 border-2 border-accent-cyan flex items-center justify-center hover:bg-accent-cyan/10 transition-all"
        >
          <Play className="w-8 h-8 text-accent-cyan ml-1" />
        </button>
        <p className="text-gray-500 text-sm">
          {sizeMB > 500 ? `${(sizeMB / 1024).toFixed(1)} GB` : `${sizeMB.toFixed(0)} MB`} — click to play
        </p>
      </div>
    )
  }

  return (
    <div className="relative">
      {state === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          <Loader2 className="w-10 h-10 text-accent-cyan animate-spin mb-3" />
          <p className="text-gray-400 text-sm">Loading video...</p>
        </div>
      )}
      <video
        ref={videoRef}
        controls
        preload="none"
        onCanPlay={handleCanPlay}
        className="w-full max-h-[70vh] bg-black"
      />
    </div>
  )
}
