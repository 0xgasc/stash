/**
 * POST /api/upload/irys
 *
 * Uploads a file to the Irys devnet (Arweave-backed permanent storage).
 *
 * Flow:
 *  1. Validate file size (max 6 GB, checked via Content-Length header AND file bytes).
 *  2. Initialize an Irys uploader using the server's Ethereum wallet (PRIVATE_KEY env).
 *  3. Check wallet balance against the quoted upload price.
 *  4. Upload the file buffer with metadata tags (Content-Type, Filename, Size, Timestamp).
 *  5. Save a record to Supabase `files` table (gracefully continues if DB is unavailable).
 *  6. For authenticated users, increment their storage quota via an RPC call.
 *  7. For anonymous uploads, generate a `claimToken` (UUID) so the file can be
 *     associated with an account later via the auth callback.
 *
 * Returns: `{ success, url, id, arUrl, size, contentType, filename, claimToken, expiresAt }`
 *
 * Environment:
 *  - PRIVATE_KEY  — Ethereum private key funding the Irys devnet wallet.
 *  - SEPOLIA_RPC  — JSON-RPC endpoint for Base Sepolia testnet.
 */
import { NextRequest, NextResponse } from 'next/server'
import { Uploader } from '@irys/upload'
import { Ethereum } from '@irys/upload-ethereum'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting Irys upload...')

    const contentLength = request.headers.get('content-length')
    console.log(`📏 Content-Length: ${contentLength} bytes`)

    // 6GB limit for Irys uploads
    const directUploadLimit = 6 * 1024 * 1024 * 1024
    if (contentLength && parseInt(contentLength) > directUploadLimit) {
      console.warn(`⚠️ File size ${contentLength} exceeds 6GB limit`)
      return NextResponse.json(
        {
          error: `File too large. Maximum size is 6GB.`,
          tip: 'Please compress your file or use a smaller version.'
        },
        { status: 413 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    console.log(`📁 Received file: ${file.name} (${file.size} bytes)`)

    const maxSize = 6 * 1024 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `File too large. Maximum is 6GB. Your file is ${(file.size / 1024 / 1024 / 1024).toFixed(2)}GB.`,
          tip: 'Please compress your file or use a smaller version.'
        },
        { status: 413 }
      )
    }

    const privateKey = process.env.PRIVATE_KEY
    const sepoliaRpc = process.env.SEPOLIA_RPC

    console.log('🔍 Environment check:')
    console.log(`  - PRIVATE_KEY exists: ${!!privateKey}`)
    console.log(`  - SEPOLIA_RPC exists: ${!!sepoliaRpc}`)

    if (!privateKey) {
      return NextResponse.json(
        { error: 'PRIVATE_KEY not configured' },
        { status: 500 }
      )
    }

    if (!sepoliaRpc) {
      return NextResponse.json(
        { error: 'SEPOLIA_RPC not configured' },
        { status: 500 }
      )
    }

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Initialize Irys uploader
    const irysUploader = await Uploader(Ethereum)
      .withWallet(privateKey)
      .withRpc(sepoliaRpc)
      .devnet()

    // Check balance and price
    const price = await irysUploader.getPrice(buffer.length)
    const balance = await irysUploader.getBalance()

    console.log(`💰 Balance: ${balance.toString()} wei, Cost: ${price.toString()} wei`)

    if (BigInt(balance.toString()) < BigInt(price.toString())) {
      return NextResponse.json(
        { error: `Insufficient balance. Need: ${price.toString()} wei, Have: ${balance.toString()} wei` },
        { status: 400 }
      )
    }

    const contentType = getContentType(file.name)

    console.log(`🚀 Uploading ${file.name} to Irys...`)
    const receipt = await irysUploader.upload(buffer, {
      tags: [
        { name: 'Content-Type', value: contentType },
        { name: 'Filename', value: file.name },
        { name: 'Original-Size', value: buffer.length.toString() },
        { name: 'Upload-Timestamp', value: new Date().toISOString() },
        { name: 'Application', value: 'Stash' }
      ]
    })

    const irysUrl = `https://devnet.irys.xyz/${receipt.id}`

    console.log(`✅ Upload successful: ${irysUrl}`)

    // Save to database (skip if Supabase not configured)
    const supabase = await createServerSupabaseClient()

    let user = null
    let claimToken: string | null = null
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 14)

    if (supabase) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      user = authUser
      claimToken = user ? null : randomUUID()

      const { error: dbError } = await supabase
        .from('files')
        .insert({
          user_id: user?.id || null,
          irys_id: receipt.id,
          url: irysUrl,
          ar_url: `ar://${receipt.id}`,
          filename: file.name,
          content_type: contentType,
          size_bytes: buffer.length,
          storage_tier: 'free',
          is_permanent: false,
          expires_at: expiresAt.toISOString(),
          claim_token: claimToken,
          claimed_at: user ? new Date().toISOString() : null
        })

      if (dbError) {
        console.warn('⚠️ Database save failed:', dbError.message)
      }

      if (user) {
        await supabase.rpc('increment_storage', {
          p_user_id: user.id,
          p_bytes: buffer.length
        })
      }
    } else {
      claimToken = randomUUID()
    }

    return NextResponse.json({
      success: true,
      url: irysUrl,
      id: receipt.id,
      arUrl: `ar://${receipt.id}`,
      size: buffer.length,
      contentType: contentType,
      filename: file.name,
      claimToken: claimToken,
      expiresAt: expiresAt.toISOString()
    })

  } catch (error) {
    console.error('❌ Irys upload error:', error)
    return NextResponse.json(
      {
        error: 'Upload failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/** Maps common file extensions to MIME types. Falls back to `application/octet-stream`. */
const getContentType = (filename: string): string => {
  const ext = filename.toLowerCase().split('.').pop()
  const contentTypes: { [key: string]: string } = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'webm': 'video/webm',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'flac': 'audio/flac',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'txt': 'text/plain',
    'zip': 'application/zip',
    'default': 'application/octet-stream'
  }

  return contentTypes[ext || ''] || contentTypes['default']
}
