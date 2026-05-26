import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'
const ADMIN_SECRET = process.env.ADMIN_BACKEND_SECRET || ''

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const amountEth = Number(body?.amountEth)

  if (!Number.isFinite(amountEth) || amountEth <= 0 || amountEth > 1) {
    return NextResponse.json(
      { error: 'amountEth must be a positive number, max 1 ETH per request' },
      { status: 400 },
    )
  }

  // ── Try Railway backend(s) first ─────────────────────────────────────
  const BACKEND_URLS = [
    UPLOAD_SERVER,
    'https://stash-production-47fc.up.railway.app',
  ].filter(Boolean)

  for (const backend of BACKEND_URLS) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 25_000)

      const res = await fetch(`${backend}/api/v1/fund-irys`, {
        method: 'POST',
        headers: {
          'X-Admin-Secret': ADMIN_SECRET,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const data = await res.json()
      return NextResponse.json(data, { status: res.status })
    } catch (err: any) {
      console.warn(`fund-irys proxy to ${backend} failed:`, err.message)
    }
  }

  // ── Fallback: Irys SDK directly ──────────────────────────────────────
  const privateKey = process.env.PRIVATE_KEY
  const sepoliaRpc = process.env.SEPOLIA_RPC
  if (!privateKey || !sepoliaRpc) {
    return NextResponse.json(
      { error: 'PRIVATE_KEY or SEPOLIA_RPC not configured' },
      { status: 500 },
    )
  }

  try {
    const { Uploader } = await import('@irys/upload')
    const { Ethereum } = await import('@irys/upload-ethereum')

    const key = privateKey.trim().replace(/^0x/i, '')
    const uploader = await Uploader(Ethereum).withWallet(key).withRpc(sepoliaRpc).devnet()

    const [whole, frac = ''] = amountEth.toString().split('.')
    const fracPadded = (frac + '0'.repeat(18)).slice(0, 18)
    const amountWei = (BigInt(whole) * BigInt(1e18) + BigInt(fracPadded)).toString()

    const balanceBefore = (await uploader.getBalance()).toString()

    let receipt
    try {
      receipt = await uploader.fund(amountWei)
    } catch (fundErr: any) {
      const msg = String(fundErr.message || '')
      const txMatch = msg.match(/0x[a-fA-F0-9]{64}/)
      return NextResponse.json({
        ok: false,
        pending: true,
        txId: txMatch ? txMatch[0] : null,
        message: 'Fund tx broadcast but bundler did not confirm within 30s.',
        details: msg,
      })
    }

    return NextResponse.json({
      ok: true,
      txId: receipt.id,
      quantity: receipt.quantity?.toString(),
      reward: receipt.reward?.toString(),
      balanceBeforeWei: balanceBefore,
    })
  } catch (sdkErr: any) {
    console.error('fund-irys SDK fallback error:', sdkErr)
    return NextResponse.json(
      { error: sdkErr.message || 'Unknown error' },
      { status: 500 },
    )
  }
}