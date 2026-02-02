/** Supabase query helpers for budget data and weekly report metrics. */

import { supabase, isSupabaseAvailable } from './supabase'

export interface BudgetGeneralRow {
  base_week: string
  metric: string
  customer: string
  month: string
  value: number
  kind: 'budget' | 'actuals'
}

export interface BudgetGeneralTotal {
  base_week: string
  metric: string
  customer: string
  scope: 'TOTAL' | 'YTD'
  value: number
  kind: 'budget' | 'actuals'
}

/**
 * Load Budget General data from Supabase (with API fallback).
 * Returns data in the same format as the API endpoint.
 */
export async function loadBudgetGeneralFromSupabase(
  baseWeek: string,
  fallbackToApi: boolean = true
): Promise<{ budget?: any; actuals?: any }> {
  try {
    // Check if Supabase is properly configured and available
    if (!isSupabaseAvailable() || !supabase || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      if (fallbackToApi) {
        return await loadBudgetGeneralFromAPI(baseWeek)
      }
      return {}
    }

    // Load detailed rows
    const { data: detailedRows, error: detailedError } = await supabase
      .from('budget_general')
      .select('*')
      .eq('base_week', baseWeek)

    if (detailedError) {
      const errorMessage = detailedError.message || String(detailedError)
      const isNetworkError = 
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
        errorMessage.includes('getaddrinfo') ||
        errorMessage.includes('network')
      
      if (isNetworkError) {
        console.warn('Network error accessing Supabase budget data, falling back to API:', errorMessage)
      } else {
        console.warn('Supabase detailed rows error:', detailedError)
      }
      
      if (fallbackToApi) {
        return await loadBudgetGeneralFromAPI(baseWeek)
      }
      return {}
    }

    // Load totals
    const { data: totalsRows, error: totalsError } = await supabase
      .from('budget_general_totals')
      .select('*')
      .eq('base_week', baseWeek)

    if (totalsError) {
      const errorMessage = totalsError.message || String(totalsError)
      const isNetworkError = 
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
        errorMessage.includes('getaddrinfo') ||
        errorMessage.includes('network')
      
      if (isNetworkError) {
        console.warn('Network error accessing Supabase budget totals, falling back to API:', errorMessage)
      } else {
        console.warn('Supabase totals error:', totalsError)
      }
      
      if (fallbackToApi) {
        return await loadBudgetGeneralFromAPI(baseWeek)
      }
      return {}
    }

    if (!detailedRows || detailedRows.length === 0) {
      // No data in Supabase, fallback to API if enabled
      if (fallbackToApi) {
        return await loadBudgetGeneralFromAPI(baseWeek)
      }
      return {}
    }

    // Transform Supabase rows to API format
    const budgetRows = detailedRows.filter((r: BudgetGeneralRow) => r.kind === 'budget')
    const actualsRows = detailedRows.filter((r: BudgetGeneralRow) => r.kind === 'actuals')
    const budgetTotals = totalsRows?.filter((r: BudgetGeneralTotal) => r.kind === 'budget') || []
    const actualsTotals = totalsRows?.filter((r: BudgetGeneralTotal) => r.kind === 'actuals') || []

    // Build budget data structure
    const budget = rowsToBudgetFormat(baseWeek, budgetRows, budgetTotals)
    const actuals = rowsToBudgetFormat(baseWeek, actualsRows, actualsTotals)

    return { budget, actuals }
  } catch (error: any) {
    const errorMessage = error?.message || String(error)
    const isNetworkError = 
      errorMessage.includes('Failed to fetch') ||
      errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
      errorMessage.includes('getaddrinfo') ||
      errorMessage.includes('network')
    
    if (isNetworkError) {
      console.warn('Network error accessing Supabase budget data, falling back to API:', errorMessage)
    } else {
      console.error('Error loading from Supabase:', error)
    }
    
    if (fallbackToApi) {
      return await loadBudgetGeneralFromAPI(baseWeek)
    }
    return {}
  }
}

/**
 * Fallback: Load Budget General from API.
 */
async function loadBudgetGeneralFromAPI(baseWeek: string): Promise<{ budget?: any; actuals?: any }> {
  try {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const [budgetRes, actualsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/budget-general?week=${baseWeek}`),
      fetch(`${API_BASE_URL}/api/actuals-general?week=${baseWeek}`),
    ])

    const budget = budgetRes.ok ? await budgetRes.json() : null
    const actuals = actualsRes.ok ? await actualsRes.json() : null

    return { budget, actuals }
  } catch (error) {
    console.error('Error loading from API:', error)
    return {}
  }
}

/**
 * Transform Supabase rows to API format.
 */
function rowsToBudgetFormat(
  baseWeek: string,
  rows: BudgetGeneralRow[],
  totals: BudgetGeneralTotal[]
): any {
  // Group by metric
  const table: Record<string, Record<string, number>> = {}
  const totalsMap: Record<string, number> = {}
  const ytdMap: Record<string, number> = {}
  const customerByMetric: Record<string, string> = {}
  const monthsSet = new Set<string>()

  for (const row of rows) {
    if (!table[row.metric]) {
      table[row.metric] = {}
    }
    table[row.metric][row.month] = row.value
    customerByMetric[row.metric] = row.customer
    monthsSet.add(row.month)
  }

  for (const total of totals) {
    if (total.scope === 'TOTAL') {
      totalsMap[total.metric] = total.value
    } else if (total.scope === 'YTD') {
      ytdMap[total.metric] = total.value
    }
    customerByMetric[total.metric] = total.customer
  }

  const months = Array.from(monthsSet).sort((a, b) => {
    // Sort chronologically (simple string sort for "Month YYYY" format)
    return a.localeCompare(b)
  })

  const metrics = Object.keys(table).sort()

  // Build display name mapping
  const displayNameByMetric: Record<string, string> = {}
  for (const metric of metrics) {
    const metricLower = metric.toLowerCase()
    if (metricLower.startsWith('share of returning customers')) {
      displayNameByMetric[metric] = 'Share of total %'
    } else if (metricLower.startsWith('share of new customers')) {
      displayNameByMetric[metric] = 'Share of total %'
    } else {
      displayNameByMetric[metric] = metric
    }
  }

  return {
    week: baseWeek,
    months,
    metrics,
    table,
    totals: totalsMap,
    ytd_totals: ytdMap,
    customer_by_metric: customerByMetric,
    display_name_by_metric: displayNameByMetric,
  }
}

/**
 * Load Weekly Report Metrics from Supabase (with API fallback).
 * Returns the complete BatchMetricsResponse structure.
 */
export async function loadWeeklyReportMetricsFromSupabase(
  baseWeek: string,
  fallbackToApi: boolean = true
): Promise<any | null> {
  try {
    // Check if Supabase is properly configured and available
    if (!isSupabaseAvailable() || !supabase || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      console.debug('Supabase not configured or not available, falling back to API')
      if (fallbackToApi) {
        return await loadWeeklyReportMetricsFromAPI(baseWeek)
      }
      return null
    }

    // Load cached metrics from Supabase
    // Use .maybeSingle() instead of .single() to avoid 406 errors when no rows exist
    // Note: Network errors (ERR_QUIC_PROTOCOL_ERROR, etc.) will be caught in the catch block
    console.log(`🔍 Attempting to load metrics from Supabase for week ${baseWeek}...`)
    const { data, error } = await supabase
      .from('weekly_report_metrics')
      .select('*')
      .eq('base_week', baseWeek)
      .maybeSingle()

    if (error) {
      // Handle specific error codes
      if (error.code === 'PGRST116' || error.code === 'PGRST205') {
        // No rows returned or table not found - data not cached yet
        console.debug(`No cached data in Supabase for week ${baseWeek}:`, error.message)
        if (fallbackToApi) {
          return await loadWeeklyReportMetricsFromAPI(baseWeek)
        }
        return null
      }
      
      // Handle network errors (ERR_QUIC_PROTOCOL_ERROR, Failed to fetch, ERR_NAME_NOT_RESOLVED, etc.)
      if (error.message?.includes('Failed to fetch') || 
          error.message?.includes('QUIC') || 
          error.message?.includes('network') ||
          error.message?.includes('ERR_NAME_NOT_RESOLVED') ||
          error.message?.includes('getaddrinfo') ||
          error.code === '') {
        console.warn(`Network error accessing Supabase for week ${baseWeek}, falling back to API:`, error.message)
        if (fallbackToApi) {
          return await loadWeeklyReportMetricsFromAPI(baseWeek)
        }
        return null
      }
      
      console.warn('Supabase weekly_report_metrics error:', error)
      if (fallbackToApi) {
        return await loadWeeklyReportMetricsFromAPI(baseWeek)
      }
      return null
    }

    // If no data returned (maybeSingle returns null instead of error)
    if (!data) {
      console.debug(`No cached data in Supabase for week ${baseWeek}`)
      if (fallbackToApi) {
        return await loadWeeklyReportMetricsFromAPI(baseWeek)
      }
      return null
    }

    const row = data as { base_week?: string; metrics?: unknown }
    if (!row.metrics) {
      // No metrics in response
      console.warn(`Cached row exists but has no metrics field for week ${baseWeek}`)
      if (fallbackToApi) {
        return await loadWeeklyReportMetricsFromAPI(baseWeek)
      }
      return null
    }

    // Supabase returns JSONB as object/string, ensure it's parsed
    let metrics: any
    if (typeof row.metrics === 'string') {
      metrics = JSON.parse(row.metrics)
    } else {
      metrics = row.metrics
    }

    console.log(`✅ Loaded weekly report metrics from Supabase for ${baseWeek}`)
    return metrics
  } catch (error: any) {
    // Handle network errors, timeouts, and other exceptions
    const errorMessage = error?.message || String(error)
    const isNetworkError = 
      errorMessage.includes('Failed to fetch') ||
      errorMessage.includes('QUIC') ||
      errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('ERR_QUIC_PROTOCOL_ERROR') ||
      errorMessage.includes('ERR_NETWORK_CHANGED') ||
      errorMessage.includes('ERR_NAME_NOT_RESOLVED') ||
      errorMessage.includes('getaddrinfo')
    
    if (isNetworkError) {
      console.warn(`Network error accessing Supabase for week ${baseWeek}, falling back to API:`, errorMessage)
    } else {
      console.error('Error loading weekly report metrics from Supabase:', error)
    }
    
    if (fallbackToApi) {
      return await loadWeeklyReportMetricsFromAPI(baseWeek)
    }
    return null
  }
}

/**
 * Fallback: Load Weekly Report Metrics from API.
 */
async function loadWeeklyReportMetricsFromAPI(baseWeek: string): Promise<any | null> {
  try {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const response = await fetch(
      `${API_BASE_URL}/api/batch/all-metrics?base_week=${baseWeek}&num_weeks=8`
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch batch metrics: ${response.statusText}`)
    }

    const data = await response.json()
    console.log(`📦 Loaded weekly report metrics from API for ${baseWeek}`)
    return data
  } catch (error) {
    console.error('Error loading from API:', error)
    return null
  }
}

