import { NextRequest, NextResponse } from 'next/server'
import { Uploader } from '@irys/upload'
import { Ethereum } from '@irys/upload-ethereum'
import { createServerSupabaseClient } from '@/app/lib/supabase-server'
import { randomUUID } from 'crypto'
import { getSettings } from '@/app/lib/settings'
import { getAnonymousUploadCount, buildIncrementedCookie, COOKIE_NAME } from '@/app/lib/upload-limiter'
import { isAdminAuthenticated } from '@/app/lib/admin-auth'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const settings = await getSettings()
    const maxSizeBytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024

    // Check auth status early for rate limiting
    const supabase = await createServerSupabaseClient()
    let user = null
    if (supabase) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      user = authUser
    }

    // Check if admin is authenticated (bypass rate limits)
    const isAdmin = await isAdminAuthenticated()

    // Rate limit anonymous users (skip for admin and logged-in users)
    if (!user && !isAdmin) {
      const uploadCount = await getAnonymousUploadCount()
      if (uploadCount >= settings.MAX_ANONYMOUS_UPLOADS) {
        return NextResponse.json(
          {
            error: 'Upload limit reached. Create a free account to continue uploading.',
            limitReached: true,
            limit: settings.MAX_ANONYMOUS_UPLOADS,
          },
          { status: 429 }
        )
      }
    }

    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > maxSizeBytes) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${(settings.MAX_FILE_SIZE_MB / 1024).toFixed(0)}GB.`,
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

    if (file.size > maxSizeBytes) {
      return NextResponse.json(
        {
          error: `File too large. Maximum is ${(settings.MAX_FILE_SIZE_MB / 1024).toFixed(0)}GB. Your file is ${(file.size / 1024 / 1024 / 1024).toFixed(2)}GB.`,
          tip: 'Please compress your file or use a smaller version.'
        },
        { status: 413 }
      )
    }

    const privateKey = process.env.PRIVATE_KEY
    const sepoliaRpc = process.env.SEPOLIA_RPC

    if (!privateKey) {
      return NextResponse.json({ error: 'PRIVATE_KEY not configured' }, { status: 500 })
    }
    if (!sepoliaRpc) {
      return NextResponse.json({ error: 'SEPOLIA_RPC not configured' }, { status: 500 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const irysUploader = await Uploader(Ethereum)
      .withWallet(privateKey)
      .withRpc(sepoliaRpc)
      .devnet()

    const price = await irysUploader.getPrice(buffer.length)
    const balance = await irysUploader.getBalance()

    if (BigInt(balance.toString()) < BigInt(price.toString())) {
      return NextResponse.json(
        { error: `Insufficient balance. Need: ${price.toString()} wei, Have: ${balance.toString()} wei` },
        { status: 400 }
      )
    }

    const contentType = getContentType(file.name)

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

    let claimToken: string | null = null
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + settings.LINK_EXPIRY_DAYS)

    if (supabase) {
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
        console.warn('Database save failed:', dbError.message)
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

    // Build response
    const responseBody: Record<string, unknown> = {
      success: true,
      url: irysUrl,
      id: receipt.id,
      arUrl: `ar://${receipt.id}`,
      size: buffer.length,
      contentType: contentType,
      filename: file.name,
      claimToken: claimToken,
      expiresAt: expiresAt.toISOString(),
    }

    // Increment anonymous upload count (skip for admin)
    if (!user && !isAdmin) {
      const currentCookie = request.cookies.get(COOKIE_NAME)?.value
      const { newCount, cookieName, cookieValue, cookieOptions } =
        buildIncrementedCookie(currentCookie)
      responseBody.uploadsRemaining = Math.max(0, settings.MAX_ANONYMOUS_UPLOADS - newCount)

      const response = NextResponse.json(responseBody)
      response.cookies.set(cookieName, cookieValue, cookieOptions)
      return response
    }

    return NextResponse.json(responseBody)

  } catch (error) {
    console.error('Irys upload error:', error)
    return NextResponse.json(
      {
        error: 'Upload failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

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
