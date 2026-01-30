/**
 * GET /api/admin/irys-balance
 *
 * Returns the Irys devnet balance and Sepolia on-chain wallet balance
 * for the server's Ethereum wallet (derived from PRIVATE_KEY).
 *
 * Requires admin authentication via HMAC-signed httpOnly cookie.
 * Both balances are returned in wei and human-readable ETH.
 *
 * Used by the /admin dashboard to monitor upload budget.
 */
import { NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'
import { Wallet } from '@ethersproject/wallet'

export async function GET() {
  const authed = await isAdminAuthenticated()
  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const privateKey = process.env.PRIVATE_KEY
  const sepoliaRpc = process.env.SEPOLIA_RPC

  if (!privateKey || !sepoliaRpc) {
    return NextResponse.json(
      { error: 'PRIVATE_KEY or SEPOLIA_RPC not configured' },
      { status: 500 }
    )
  }

  try {
    // Derive wallet address from private key
    const wallet = new Wallet(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`)
    const address = wallet.address

    // Fetch Irys devnet balance and Sepolia on-chain balance in parallel
    const [irysRes, sepoliaRes] = await Promise.all([
      fetch(`https://devnet.irys.xyz/account/balance/ethereum?address=${address}`),
      fetch(sepoliaRpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [address, 'latest'],
          id: 1,
        }),
      }),
    ])

    const irysData = await irysRes.json()
    const sepoliaData = await sepoliaRes.json()

    const irysBalanceWei = BigInt(irysData.balance || '0')
    const sepoliaBalanceWei = BigInt(sepoliaData.result || '0')

    // Convert to ETH (18 decimals)
    const toEth = (wei: bigint) => {
      const whole = wei / BigInt(1e18)
      const frac = wei % BigInt(1e18)
      const fracStr = frac.toString().padStart(18, '0').slice(0, 6)
      return `${whole}.${fracStr}`
    }

    return NextResponse.json({
      address,
      irys: {
        balanceWei: irysBalanceWei.toString(),
        balanceEth: toEth(irysBalanceWei),
      },
      sepolia: {
        balanceWei: sepoliaBalanceWei.toString(),
        balanceEth: toEth(sepoliaBalanceWei),
      },
    })
  } catch (error) {
    console.error('Balance check error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch balances', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
