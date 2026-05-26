import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'
import { Uploader } from '@irys/upload'
import { Ethereum } from '@irys/upload-ethereum'

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

  const privateKey = process.env.PRIVATE_KEY
  const sepoliaRpc = process.env.SEPOLIA_RPC
  if (!privateKey || !sepoliaRpc) {
    return NextResponse.json(
      { error: 'PRIVATE_KEY or SEPOLIA_RPC not configured' },
      { status: 500 },
    )
  }

  try {
    const key = privateKey.trim().replace(/^0x/i, '')
    const uploader = await Uploader(Ethereum).withWallet(key).withRpc(sepoliaRpc).devnet()

    // Convert ETH to wei (bigint-safe)
    const [whole, frac = ''] = amountEth.toString().split('.')
    const fracPadded = (frac + '0'.repeat(18)).slice(0, 18)
    const amountWei = (BigInt(whole) * BigInt(1e18) + BigInt(fracPadded)).toString()

    const balanceBefore = (await uploader.getBalance()).toString()

    let receipt
    try {
      receipt = await uploader.fund(amountWei)
    } catch (fundErr: any) {
      // Common: tx submitted but Irys bundler times out at ~30s
      const msg = String(fundErr.message || '')
      const txMatch = msg.match(/0x[a-fA-F0-9]{64}/)
      return NextResponse.json({
        ok: false,
        pending: true,
        txId: txMatch ? txMatch[0] : null,
        message:
          'Fund tx broadcast but bundler did not confirm within 30s. It will likely credit once Sepolia mines (~1-3 min).',
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
  } catch (err: any) {
    console.error('fund-irys error:', err)
    return NextResponse.json(
      { error: err.message || 'Unknown error' },
      { status: 500 },
    )
  }
}
