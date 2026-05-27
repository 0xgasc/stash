/**
 * /me/setup — first-login handle picker.
 *
 * Server component verifies the session and redirects out if the user
 * already has a handle. The form is a tiny client island.
 */
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/app/lib/auth'
import { getServerT } from '@/app/lib/i18n/server'
import HandlePicker from '@/app/components/HandlePicker'
import LangSwitcher from '@/app/components/LangSwitcher'

export default async function SetupPage() {
  const { stashUser } = await requireUser({ requireHandle: false })
  if (stashUser.handle) redirect('/me')
  const { t } = await getServerT(stashUser.preferred_locale)

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 relative">
      <div className="absolute top-4 right-4"><LangSwitcher /></div>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-medium text-white">{t('setup.title')}</h1>
          <p className="text-gray-500 text-sm mt-2">{t('setup.subtitle', { prefix: 'stash.app' })}</p>
        </div>
        <HandlePicker />
        <div className="text-center mt-6">
          <Link href="/" className="text-gray-600 hover:text-gray-400 text-xs">
            {t('setup.skip_for_now')}
          </Link>
        </div>
      </div>
    </div>
  )
}
