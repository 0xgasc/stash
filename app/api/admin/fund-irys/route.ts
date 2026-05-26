import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'

const UPLOAD_SERVER = process.env.NEXT_PUBLIC_UPLOAD_SERVER || 'http://localhost:5050'
const ADMIN_SECRET = process.env.ADMIN_BACKEND_SECRET || ''

type ChainKey = 'sepolia' | 'base-sepolia' | 'arbitrum-sepolia'

const CHAINS: Record<ChainKey, { label: string; rpc: string; chainId: number }> = {
  sepolia: {
    label: 'Sepolia',
    rpc: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com',
    chainId: 11155111,
  },
  'base-sepolia': {
    label: 'Base Sepolia',
    rpc: 'https://sepolia.base.org',
    chainId: 84532,
  },
  'arbitrum-sepolia': {
    label: 'Arbitrum Sepolia',
    rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
    chainId: 421614,
  },
}

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const amountEth = Number(body?.amountEth)
  const chain = (body?.chain || 'sepolia') as ChainKey
  const chainConfig = CHAINS[chain]
  if (!chainConfig) {
    return NextResponse.json(
      { error: `Unsupported chain: ${chain}. Use: ${Object.keys(CHAINS).join(', ')}` },
      { status: 400 },
    )
  }

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
        body: JSON.stringify({ amountEth, chain }),
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
  if (!privateKey) {
    return NextResponse.json(
      { error: 'PRIVATE_KEY not configured' },
      { status: 500 },
    )
  }

  try {
    const { Uploader } = await import('@irys/upload')
    const { Ethereum } = await import('@irys/upload-ethereum')

    const key = privateKey.trim().replace(/^0x/i, '')
    const uploader = await Uploader(Ethereum)
      .withWallet(key)
      .withRpc(chainConfig.rpc)
      .devnet()

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
      chain: chainConfig.label,
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