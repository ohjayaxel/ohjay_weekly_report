'use client'

import { useDataCache } from '@/contexts/DataCacheContext'
import LoadingProgress from '@/components/LoadingProgress'
import { useSearchParams } from 'next/navigation'

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const { loading, loadingProgress } = useDataCache()
  const searchParams = useSearchParams()
  const pdfParam = searchParams?.get('pdf')
  const isPdfMode = pdfParam === '1' || pdfParam === 'true'

  // Don't show loading progress in PDF mode - let the page render even while loading
  // This prevents the loading indicator from appearing in the PDF
  if (loading && loadingProgress && !isPdfMode) {
    return <LoadingProgress progress={loadingProgress} />
  }

  return <>{children}</>
}

