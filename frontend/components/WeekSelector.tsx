'use client'

import { useMemo } from 'react'
import { Calendar } from 'lucide-react'

interface WeekSelectorProps {
  value: string
  onChange: (week: string) => void
  className?: string
}

/** Lightweight week dropdown (year-week). Same option range as PeriodSelector. */
export default function WeekSelector({ value, onChange, className = '' }: WeekSelectorProps) {
  const weekOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]
    const options: string[] = []
    for (const year of years) {
      for (let week = 1; week <= 53; week++) {
        options.push(`${year}-${week.toString().padStart(2, '0')}`)
      }
    }
    return options
  }, [])

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || '')}
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        aria-label="Select week"
      >
        <option value="">Select week</option>
        {weekOptions.map((week) => (
          <option key={week} value={week}>
            {week}
          </option>
        ))}
      </select>
    </div>
  )
}
