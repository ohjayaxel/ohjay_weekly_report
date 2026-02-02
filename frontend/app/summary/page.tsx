'use client'

import { useState, useEffect } from 'react'
import MetricsPreview from '@/components/MetricsPreview'
import { useDataCache } from '@/contexts/DataCacheContext'
import { Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

export default function Summary() {
  const { periods, baseWeek, loading, error, loadAllData } = useDataCache()
  const [metrics, setMetrics] = useState<unknown>(null)
  const [retryCount, setRetryCount] = useState(0)

  // Load data on mount if not already loaded
  useEffect(() => {
    if (!periods && !loading && baseWeek) {
      loadAllData(baseWeek, false)
    }
  }, [periods, loading, baseWeek, loadAllData])

  const handleRetry = async () => {
    setRetryCount(prev => prev + 1)
    if (baseWeek) {
      await loadAllData(baseWeek, true)
    }
  }

  // Show error if loading fails and no periods after a delay
  const showError = error || (!periods && !loading && retryCount > 0)

  return (
    <div className="space-y-8">
      {showError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800 mb-2">
            {error || 'Failed to load data. Please check if the backend server is running.'}
          </p>
          <Button 
            onClick={handleRetry}
            variant="outline"
            size="sm"
            className="text-red-800 border-red-300 hover:bg-red-100"
          >
            Retry
          </Button>
        </div>
      )}
      {periods ? (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary Metrics</h2>
          <MetricsPreview 
            periods={periods}
            baseWeek={baseWeek}
            onMetricsChange={setMetrics}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Loading Summary Metrics</h2>
              <p className="text-sm text-gray-600">
                {loading ? 'Loading data...' : 'Initializing data...'}
              </p>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      )}
    </div>
  )
}

