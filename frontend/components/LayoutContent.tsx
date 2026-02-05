'use client'

import { useDataCache } from '@/contexts/DataCacheContext'
import LoadingProgress from '@/components/LoadingProgress'
import { useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Calendar, Settings, Loader2 } from 'lucide-react'
import WeekSelector from '@/components/WeekSelector'

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const { loading, loadingProgress, baseWeek, setBaseWeek, hasRestoredWeek } = useDataCache()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const pdfParam = searchParams?.get('pdf')
  const isPdfMode = pdfParam === '1' || pdfParam === 'true'
  const isSettings = pathname === '/settings'

  // Before we've restored week from URL/localStorage, show a neutral loading state (same on server and client to avoid hydration mismatch)
  if (!hasRestoredWeek && !isSettings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // No week selected – show prompt (except on Settings where they can select)
  if (!baseWeek && !isSettings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 px-4">
        <Calendar className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">No week chosen</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Choose a week in Settings to load and view reports.
        </p>
        <Link
          href="/settings"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to Settings
        </Link>
      </div>
    )
  }

  // Don't show loading progress in PDF mode - let the page render even while loading
  if (loading && loadingProgress && !isPdfMode) {
    return <LoadingProgress progress={loadingProgress} />
  }

  // Report pages: show week selector bar so user can change week without going to Settings
  if (baseWeek && !isSettings && !isPdfMode) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2 rounded-md">
          <WeekSelector value={baseWeek} onChange={setBaseWeek} />
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
        {children}
      </div>
    )
  }

  return <>{children}</>
}

