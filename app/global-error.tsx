'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body style={{ background: '#050505', color: '#ededed', fontFamily: 'monospace' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '3rem', fontWeight: 'bold', color: '#d47070' }}>ERR</p>
          <p style={{ color: '#9ca3af' }}>Something went wrong.</p>
          <button
            onClick={reset}
            style={{ padding: '0.75rem 1.5rem', border: '1px solid #7dd3c0', color: '#7dd3c0', background: 'transparent', cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 'bold' }}
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  )
}
