import { Inter } from 'next/font/google'
import { Suspense } from 'react'
import './globals.css'
import SidebarLayout from '@/components/SidebarLayout'
import { DataCacheProvider } from '@/contexts/DataCacheContext'
import { ChartSettingsProvider } from '@/contexts/ChartSettingsContext'
import LayoutContent from '@/components/LayoutContent'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Weekly Report Generator',
  description: 'Generate professional weekly reports with data validation',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <DataCacheProvider>
          <ChartSettingsProvider>
            <Suspense fallback={
              <SidebarLayout>{children}</SidebarLayout>
            }>
              <LayoutContent>
                <SidebarLayout>
                  {children}
                </SidebarLayout>
              </LayoutContent>
            </Suspense>
          </ChartSettingsProvider>
        </DataCacheProvider>
      </body>
    </html>
  )
}
