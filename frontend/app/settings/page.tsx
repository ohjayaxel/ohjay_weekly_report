'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import BatchFileUpload from '@/components/BatchFileUpload'
import FileMetadata from '@/components/FileMetadata'
import PeriodSelector from '@/components/PeriodSelector'
import { Separator } from '@/components/ui/separator'
import { useDataCache } from '@/contexts/DataCacheContext'
import { useChartSettings } from '@/contexts/ChartSettingsContext'
import { RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import { hasBackend } from '@/lib/api'
const METADATA_CACHE_EXPIRY = 10 * 60 * 1000 // 10 minutes
const DIMENSIONS_CACHE_EXPIRY = 10 * 60 * 1000 // 10 minutes

export default function Settings() {
  const { refreshData, loading, loadingProgress, baseWeek, setBaseWeek } = useDataCache()
  const { animationsEnabled, setAnimationsEnabled } = useChartSettings()
  const [selectedWeek, setSelectedWeek] = useState(baseWeek)
  const [periods, setPeriods] = useState<any>(null)
  const [metadata, setMetadata] = useState<any>(null)
  const [dimensions, setDimensions] = useState<any>(null)
  const [loadingDimensions, setLoadingDimensions] = useState(false)
  const [metadataLoading, setMetadataLoading] = useState(true)
  const metadataTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [weeksWithData, setWeeksWithData] = useState<Set<string> | null>(null)
  const [weeksWithFiles, setWeeksWithFiles] = useState<string[]>([])
  const [weeksAvailable, setWeeksAvailable] = useState<string[]>([])
  const [weekAliases, setWeekAliases] = useState<Record<string, string>>({})
  const [copyFrom, setCopyFrom] = useState('')
  const [copyTo, setCopyTo] = useState('')
  const [aliasActionLoading, setAliasActionLoading] = useState(false)
  const [aliasActionMessage, setAliasActionMessage] = useState<string | null>(null)
  const [generateTarget, setGenerateTarget] = useState<string | null>(null)
  const [generateLoading, setGenerateLoading] = useState(false)
  const [generatingForTarget, setGeneratingForTarget] = useState<string | null>(null)

  // "Has data" = filer finns i Supabase (Storage). Backend returnerar veckor med filer (disk + Storage).
  useEffect(() => {
    if (hasBackend) {
      Promise.all([
        import('@/lib/api').then((m) => m.getWeeksWithFiles()),
        import('@/lib/api').then((m) => m.getWeeksAvailable()),
        import('@/lib/api').then((m) => m.getWeekAliases()),
      ]).then(([wf, wa, al]) => {
        setWeeksWithFiles(wf.weeks || [])
        setWeeksAvailable(wa.weeks || [])
        setWeekAliases(al.aliases || {})
        setWeeksWithData(new Set(wf.weeks || []))
      }).catch(() => {})
    } else {
      import('@/lib/supabase-queries')
        .then((m) => m.getWeeksWithDataFromSupabase())
        .then((weeks) => setWeeksWithData(new Set(weeks)))
    }
  }, [hasBackend])

  // "Has data" = veckor som har uppladdade filer i Supabase (Storage). Inga alias-räknas-in.
  const effectiveWeeksWithData = useMemo(() => new Set(weeksWithData ?? []), [weeksWithData])

  // Sync selectedWeek with baseWeek from context
  useEffect(() => {
    setSelectedWeek(baseWeek)
  }, [baseWeek])

  const loadMetadata = useCallback(async (clearCache = false) => {
    setMetadataLoading(true)
    if (!selectedWeek) {
      setMetadata(null)
      setMetadataLoading(false)
      return
    }
    if (!hasBackend) {
      setMetadata({ error: 'Backend not configured. File status is only available when NEXT_PUBLIC_API_URL is set (e.g. running locally).' })
      setMetadataLoading(false)
      return
    }
    const cacheKey = `file_metadata_${selectedWeek}`
    
    if (clearCache) {
      localStorage.removeItem(cacheKey)
    } else {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          const cacheAge = Date.now() - parsed.timestamp
          if (cacheAge < METADATA_CACHE_EXPIRY) {
            setMetadata(parsed.data)
            setMetadataLoading(false)
            return
          }
        } catch (err) {
          console.warn('Failed to load cached metadata:', err)
        }
      }
    }
    
    let timeoutId: NodeJS.Timeout | null = null
    try {
      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiBase}/api/file-metadata?week=${selectedWeek}`, {
        signal: controller.signal
      })
      
      if (timeoutId) clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      if (data && typeof data === 'object') {
        setMetadata(data)
        localStorage.setItem(cacheKey, JSON.stringify({
          data,
          timestamp: Date.now()
        }))
      } else {
        console.error('Invalid metadata response:', data)
        setMetadata({})
      }
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId)
      
      // Handle different types of errors
      const errorName = error?.name || ''
      const errorMessage = error?.message || String(error) || 'Unknown error'
      
      if (errorName === 'AbortError' || errorName === 'TimeoutError') {
        // Request was aborted (timeout or rapid refresh). Ignore to avoid noisy console errors.
        return
      } else if (
        errorName === 'TypeError' ||
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('Network request failed') ||
        errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
        errorMessage.includes('ERR_CONNECTION_REFUSED')
      ) {
        console.error('Network error loading metadata:', error)
        setMetadata({ 
          error: 'Network error: Unable to connect to backend. Please check if the backend is running and NEXT_PUBLIC_API_URL is set.' 
        })
      } else {
        console.error('Failed to load metadata:', error)
        setMetadata({ error: errorMessage || 'Failed to load metadata' })
      }
    } finally {
      setMetadataLoading(false)
    }
  }, [selectedWeek])

  const loadDimensions = useCallback(async (clearCache = false) => {
    setLoadingDimensions(true)
    if (!selectedWeek) {
      setDimensions(null)
      setLoadingDimensions(false)
      return
    }
    if (!hasBackend) {
      setDimensions({})
      setLoadingDimensions(false)
      return
    }
    const cacheKey = `file_dimensions_${selectedWeek}`
    
    if (clearCache) {
      localStorage.removeItem(cacheKey)
    } else {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        try {
          const parsed = JSON.parse(cached)
          const cacheAge = Date.now() - parsed.timestamp
          if (cacheAge < DIMENSIONS_CACHE_EXPIRY) {
            setDimensions(parsed.data)
            setLoadingDimensions(false)
            return
          }
        } catch (err) {
          console.warn('Failed to load cached dimensions:', err)
        }
      }
    }
    
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const response = await fetch(`${apiBase}/api/file-dimensions?week=${selectedWeek}`)
      if (!response.ok) {
        console.warn(`Failed to fetch dimensions: ${response.statusText}`)
        setDimensions({})
        return
      }
      const data = await response.json()
      setDimensions(data)
      localStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }))
    } catch (error) {
      console.warn('Failed to load dimensions:', error)
      setDimensions({})
    } finally {
      setLoadingDimensions(false)
    }
  }, [selectedWeek])

  // Load metadata on mount and when week changes
  useEffect(() => {
    // Clear any pending timeout
    if (metadataTimeoutRef.current) {
      clearTimeout(metadataTimeoutRef.current)
    }
    
    // Load metadata when week changes (debounced)
    metadataTimeoutRef.current = setTimeout(() => {
      loadMetadata(false)
    }, 300)
    
    return () => {
      if (metadataTimeoutRef.current) {
        clearTimeout(metadataTimeoutRef.current)
      }
    }
  }, [selectedWeek, loadMetadata])

  const fileTypes = [
    { type: 'qlik', label: 'Qlik Sales Data', formats: '.xlsx,.csv' },
    { type: 'dema_spend', label: 'DEMA Marketing Spend', formats: '.csv' },
    { type: 'dema_gm2', label: 'DEMA GM2 Data', formats: '.csv' },
    { type: 'shopify', label: 'Shopify Sessions Data', formats: '.csv' },
    { type: 'budget', label: 'Budget Data', formats: '.csv' }
  ]

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Data File Management</CardTitle>
          <CardDescription>
            Upload weekly data files and view their status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Chart Settings */}
          <div>
            <h3 className="text-sm font-medium mb-3">Chart Settings</h3>
            <div className="flex items-center justify-between py-2">
              <div className="flex-1">
                <div className="text-sm font-medium">Enable Chart Animations</div>
                <p className="text-xs text-gray-500 mt-1">
                  Chart animations are automatically disabled during PDF generation
                </p>
              </div>
              <Switch
                checked={animationsEnabled}
                onCheckedChange={setAnimationsEnabled}
              />
            </div>
          </div>

          <Separator />

          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-medium">Select Week</h3>
              {selectedWeek && (
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded ${
                    effectiveWeeksWithData.has(selectedWeek)
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                  title={effectiveWeeksWithData.has(selectedWeek) ? 'Data loaded for this week' : 'No data uploaded for this week yet'}
                >
                  {effectiveWeeksWithData.has(selectedWeek) ? 'Has data' : 'No data'}
                </span>
              )}
            </div>
            <PeriodSelector
              selectedWeek={selectedWeek || ''}
              onWeekChange={(week) => {
                setSelectedWeek(week || '')
                setBaseWeek(week || '')
              }}
              onPeriodsChange={(p) => setPeriods(p as any)}
              weeksWithData={effectiveWeeksWithData}
            />
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-3">Use another week&apos;s data</h3>
            <p className="text-xs text-gray-500 mb-3">
              Use data files from one week for another week (no file copy – reports for the target week will use the source week&apos;s files).
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="copy-from" className="text-xs font-medium text-gray-600">Copy data from</label>
                <select
                  id="copy-from"
                  value={copyFrom}
                  onChange={(e) => setCopyFrom(e.target.value)}
                  className="min-w-[140px] px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
                >
                  <option value="">Select week</option>
                  {weeksWithFiles.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="copy-to" className="text-xs font-medium text-gray-600">Copy to</label>
                <select
                  id="copy-to"
                  value={copyTo}
                  onChange={(e) => setCopyTo(e.target.value)}
                  className="min-w-[140px] px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
                >
                  <option value="">Select week</option>
                  {weeksAvailable.map((w) => (
                    <option key={w} value={w}>{w}</option>
                  ))}
                </select>
              </div>
              <Button
                onClick={async () => {
                  if (!copyFrom || !copyTo) return
                  setAliasActionMessage(null)
                  setAliasActionLoading(true)
                  try {
                    const { setWeekAlias } = await import('@/lib/api')
                    await setWeekAlias(copyTo, copyFrom)
                    setWeekAliases((prev) => ({ ...prev, [copyTo]: copyFrom }))
                    setAliasActionMessage(`Week ${copyTo} will use data from ${copyFrom}. Generate reports to compute and save.`)
                    setGenerateTarget(copyTo)
                    setCopyTo('')
                    setCopyFrom('')
                    if (hasBackend) {
                      const { getWeeksWithFiles } = await import('@/lib/api')
                      const r = await getWeeksWithFiles()
                      setWeeksWithData(new Set(r.weeks || []))
                    } else {
                      const { getWeeksWithDataFromSupabase } = await import('@/lib/supabase-queries')
                      const weeks = await getWeeksWithDataFromSupabase()
                      setWeeksWithData(new Set(weeks))
                    }
                  } catch (e: any) {
                    setAliasActionMessage(e?.message || 'Failed to set alias')
                  } finally {
                    setAliasActionLoading(false)
                  }
                }}
                disabled={!copyFrom || !copyTo || aliasActionLoading}
              >
                {aliasActionLoading ? 'Applying...' : 'Apply'}
              </Button>
            </div>
            {aliasActionMessage && (
              <p className={`mt-2 text-sm ${aliasActionMessage.startsWith('Week') ? 'text-green-700' : 'text-red-600'}`}>
                {aliasActionMessage}
              </p>
            )}
            {generateTarget && (
              <div className="mt-3 flex items-center gap-2">
                <Button
                  onClick={async () => {
                    setAliasActionMessage(null)
                    setGenerateLoading(true)
                    try {
                      const { syncSupabase } = await import('@/lib/api')
                      await syncSupabase(generateTarget, 8)
                      setAliasActionMessage(`Reports generated for ${generateTarget}. You can now select that week to view.`)
                      setGenerateTarget(null)
                      await refreshData()
                      if (hasBackend) {
                        const { getWeeksWithFiles } = await import('@/lib/api')
                        const r = await getWeeksWithFiles()
                        setWeeksWithData(new Set(r.weeks || []))
                      } else {
                        const { getWeeksWithDataFromSupabase } = await import('@/lib/supabase-queries')
                        const weeks = await getWeeksWithDataFromSupabase()
                        setWeeksWithData(new Set(weeks))
                      }
                    } catch (e: any) {
                      setAliasActionMessage(e?.message || 'Failed to generate reports')
                    } finally {
                      setGenerateLoading(false)
                    }
                  }}
                  disabled={generateLoading}
                >
                  {generateLoading ? 'Generating…' : `Generate reports for ${generateTarget}`}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setGenerateTarget(null); setAliasActionMessage(null) }}>Dismiss</Button>
              </div>
            )}
            {Object.keys(weekAliases).length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-600 mb-1">Current aliases (report week → data from)</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  {Object.entries(weekAliases).map(([target, source]) => (
                    <li key={target} className="flex items-center gap-2 flex-wrap">
                      <span>{target} → {source}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={async () => {
                          setAliasActionMessage(null)
                          setGeneratingForTarget(target)
                          try {
                            const { syncSupabase } = await import('@/lib/api')
                            await syncSupabase(target, 8)
                            setAliasActionMessage(`Reports generated for ${target}.`)
                            await refreshData()
                            if (hasBackend) {
                              const { getWeeksWithFiles } = await import('@/lib/api')
                              const r = await getWeeksWithFiles()
                              setWeeksWithData(new Set(r.weeks || []))
                            } else {
                              const { getWeeksWithDataFromSupabase } = await import('@/lib/supabase-queries')
                              const weeks = await getWeeksWithDataFromSupabase()
                              setWeeksWithData(new Set(weeks))
                            }
                          } catch (e: any) {
                            setAliasActionMessage(e?.message || 'Failed to generate')
                          } finally {
                            setGeneratingForTarget(null)
                          }
                        }}
                        disabled={generatingForTarget !== null}
                      >
                        {generatingForTarget === target ? 'Generating…' : 'Generate reports'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={async () => {
                          setAliasActionMessage(null)
                          try {
                            const { deleteWeekAlias } = await import('@/lib/api')
                            await deleteWeekAlias(target)
                            setWeekAliases((prev) => {
                              const next = { ...prev }
                              delete next[target]
                              return next
                            })
                            setAliasActionMessage(`Alias removed for ${target}.`)
                          } catch (e: any) {
                            setAliasActionMessage(e?.message || 'Failed to remove alias')
                          }
                        }}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-6">
            <h3 className="text-sm font-medium">
              {selectedWeek ? `Upload Files for Week ${selectedWeek}` : 'Välj en vecka ovan för att ladda upp filer'}
            </h3>
            
            {selectedWeek && (
            <BatchFileUpload
              fileTypes={fileTypes}
              currentWeek={selectedWeek}
              onUploadComplete={async () => {
                await loadMetadata(true)
                if (hasBackend) {
                  try {
                    const { getWeeksWithFiles } = await import('@/lib/api')
                    const r = await getWeeksWithFiles()
                    setWeeksWithData(new Set(r.weeks || []))
                    setWeeksWithFiles(r.weeks || [])
                  } catch (_) { /* ignore */ }
                }
              }}
              refreshData={async () => {
                await refreshData()
                // Don't auto-load dimensions - user can click button if needed
              }}
              loading={loading}
              loadingProgress={loadingProgress}
            />
            )}

            {/* File Metadata Display */}
            <div className="space-y-4 mt-6">
              <h4 className="text-sm font-medium">Current Files</h4>
              {!selectedWeek ? (
                <p className="text-sm text-muted-foreground">Välj en vecka för att se filstatus.</p>
              ) : metadataLoading && metadata === null ? (
                <div className="text-sm text-gray-500 italic flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading file status...
                </div>
              ) : metadata?.error ? (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
                  <div className="font-medium mb-1">Error loading file metadata</div>
                  <div>{metadata.error}</div>
                  <Button
                    onClick={() => loadMetadata(true)}
                    variant="outline"
                    size="sm"
                    className="mt-2"
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {fileTypes.map((ft) => (
                    <div key={ft.type} className="space-y-2">
                      <div className="text-sm font-medium text-gray-700">{ft.label}</div>
                      {metadata && metadata[ft.type] ? (
                        <>
                          <FileMetadata
                            filename={metadata[ft.type].filename}
                            firstDate={metadata[ft.type].first_date}
                            lastDate={metadata[ft.type].last_date}
                            uploadedAt={metadata[ft.type].uploaded_at}
                            rowCount={metadata[ft.type].row_count}
                          />
                          {/* Dimension validation status */}
                          {dimensions && dimensions[ft.type] && (
                            <div className="flex items-center gap-2 text-sm">
                              {dimensions[ft.type].has_country === true ? (
                                <div className="flex items-center gap-1 text-green-600">
                                  <CheckCircle2 className="h-4 w-4" />
                                  <span>Country dimension detected</span>
                                </div>
                              ) : dimensions[ft.type].has_country === false ? (
                                <div className="flex items-center gap-1 text-red-600">
                                  <XCircle className="h-4 w-4" />
                                  <span>Country dimension missing</span>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-gray-500 italic">
                          No file uploaded yet
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

