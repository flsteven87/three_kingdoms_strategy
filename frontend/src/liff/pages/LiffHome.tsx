/**
 * LIFF Home Page
 *
 * Main LIFF page with tabs for:
 * - Roster: Game ID registration
 * - Copper: Copper mine management
 */

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLiffContext } from '../hooks/use-liff-context'
import { RosterTab } from './RosterTab'
import { CopperTab } from './CopperTab'

export function LiffHome() {
  const { session } = useLiffContext()
  const [activeTab, setActiveTab] = useState('roster')

  return (
    <div className="p-4 max-w-lg mx-auto">
      <div className="mb-4 text-center">
        <p className="text-sm text-muted-foreground">
          {session.lineDisplayName}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="roster">遊戲 ID</TabsTrigger>
          <TabsTrigger value="copper">銅礦管理</TabsTrigger>
        </TabsList>

        <TabsContent value="roster">
          <RosterTab session={session} />
        </TabsContent>

        <TabsContent value="copper">
          <CopperTab session={session} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
