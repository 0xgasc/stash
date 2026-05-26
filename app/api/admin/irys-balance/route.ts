/**
 * GET /api/admin/irys-balance
 *
 * Returns the Irys devnet balance and on-chain wallet balances
 * for the server's Ethereum wallet (derived from PRIVATE_KEY).
 * Checks Sepolia, Base Sepolia, and Arbitrum Sepolia.
 */
import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'
import { Wallet } from '@ethersproject/wallet'

const CHAINS: Record<string, { label: string; rpc: string }> = {
  sepolia: {
    label: 'Sepolia',
    rpc: process.env.SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com',
  },
  'base-sepolia': {
    label: 'Base Sepolia',
    rpc: 'https://sepolia.base.org',
  },
  'arbitrum-sepolia': {
    label: 'Arbitrum Sepolia',
    rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
  },
}

export async function GET() {
  const authed = await isAdminAuthenticated()
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const privateKey = process.env.PRIVATE_KEY
  if (!privateKey) {
    return NextResponse.json(
      { error: 'PRIVATE_KEY not configured' },
      { status: 500 },
    )
  }

  try {
    const wallet = new Wallet(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`)
    const address = wallet.address

    // Fetch Irys devnet balance + all chain balances in parallel
    const [irysRes, ...chainResults] = await Promise.all([
      fetch(`https://devnet.irys.xyz/account/balance/ethereum?address=${address}`),
      ...Object.entries(CHAINS).map(([key, chain]) =>
        fetch(chain.rpc, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [address, 'latest'],
            id: 1,
          }),
        }).then(async (res) => {
          const data = await res.json()
          return { key, balanceWei: data.result || '0' }
        }).catch(() => ({ key, balanceWei: '0' })),
      ),
    ])

    const irysData = await irysRes.json()
    const irysBalanceWei = BigInt(irysData.balance || '0')

    const toEth = (wei: bigint) => {
      const whole = wei / BigInt(1e18)
      const frac = wei % BigInt(1e18)
      const fracStr = frac.toString().padStart(18, '0').slice(0, 6)
      return `${whole}.${fracStr}`
    }

    const chains: Record<string, { label: string; balanceWei: string; balanceEth: string }> = {}
    for (const { key, balanceWei } of chainResults) {
      const wei = BigInt(balanceWei)
      chains[key] = {
        label: CHAINS[key].label,
        balanceWei: wei.toString(),
        balanceEth: toEth(wei),
      }
    }

    return NextResponse.json({
      address,
      irys: {
        balanceWei: irysBalanceWei.toString(),
        balanceEth: toEth(irysBalanceWei),
      },
      chains,
    })
  } catch (error) {
    console.error('Balance check error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch balances', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}