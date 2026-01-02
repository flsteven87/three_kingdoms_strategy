/**
 * LIFF Home Page
 *
 * Compact LIFF page for Tall mode (bottom sheet).
 * Tabs: Game ID registration, Copper mine management, Performance analytics.
 */

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLiffContext } from '../hooks/use-liff-context'
import { RosterTab } from './RosterTab'
import { CopperTab } from './CopperTab'
import { PerformanceTab } from './PerformanceTab'

export function LiffHome() {
  const { session } = useLiffContext()
  const [activeTab, setActiveTab] = useState('roster')

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
      {/* Sticky header with tabs */}
      <div className="sticky top-0 z-10 bg-background border-b px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">
            {session.lineDisplayName}
          </span>
        </div>
        <TabsList className="grid w-full grid-cols-3 h-9">
          <TabsTrigger value="roster" className="text-sm">
            遊戲 ID
          </TabsTrigger>
          <TabsTrigger value="copper" className="text-sm">
            銅礦
          </TabsTrigger>
          <TabsTrigger value="performance" className="text-sm">
            表現
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        <TabsContent value="roster" className="m-0">
          <RosterTab session={session} />
        </TabsContent>
        <TabsContent value="copper" className="m-0">
          <CopperTab session={session} />
        </TabsContent>
        <TabsContent value="performance" className="m-0">
          <PerformanceTab session={session} />
        </TabsContent>
      </div>
    </Tabs>
  )
}
