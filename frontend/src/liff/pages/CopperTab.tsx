/**
 * Copper Tab
 *
 * Copper mine registration and management for LIFF users.
 */

import { useState } from 'react'
import { MapPin, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  useLiffCopperMines,
  useLiffRegisterCopper,
  useLiffDeleteCopper,
} from '../hooks/use-liff-copper'
import type { LiffSession } from '../hooks/use-liff-session'

interface Props {
  readonly session: LiffSession
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function parseCoordinate(coord: string): { x: number; y: number } | null {
  const match = coord.match(/^(\d+)[,，\s]+(\d+)$/)
  if (!match) return null
  return { x: parseInt(match[1], 10), y: parseInt(match[2], 10) }
}

export function CopperTab({ session }: Props) {
  const [gameId, setGameId] = useState('')
  const [coordinate, setCoordinate] = useState('')
  const [level, setLevel] = useState('9')

  const context = {
    lineUserId: session.lineUserId,
    lineGroupId: session.lineGroupId!,
  }

  const { data, isLoading, error } = useLiffCopperMines(context)
  const registerMutation = useLiffRegisterCopper(context)
  const deleteMutation = useLiffDeleteCopper(context)

  const handleRegister = async () => {
    if (!gameId.trim() || !coordinate.trim()) return

    const parsed = parseCoordinate(coordinate)
    if (!parsed) {
      alert('座標格式錯誤，請輸入如: 123,456')
      return
    }

    try {
      await registerMutation.mutateAsync({
        gameId: gameId.trim(),
        coordX: parsed.x,
        coordY: parsed.y,
        level: parseInt(level, 10),
      })
      setGameId('')
      setCoordinate('')
    } catch {
      // Error handled by mutation
    }
  }

  const handleDelete = async (mineId: string) => {
    if (!confirm('確定要刪除此銅礦記錄？')) return
    await deleteMutation.mutateAsync({ mineId })
  }

  if (isLoading) {
    return (
      <div className="py-8 text-center text-muted-foreground">載入中...</div>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center text-destructive">
        載入失敗: {error.message}
      </div>
    )
  }

  const mines = data?.mines || []

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">註冊銅礦</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            placeholder="遊戲 ID"
          />
          <div className="flex gap-2">
            <Input
              value={coordinate}
              onChange={(e) => setCoordinate(e.target.value)}
              placeholder="座標 (例: 123,456)"
              className="flex-1"
            />
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...Array(10)].map((_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {i + 1} 級
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            請確保遊戲 ID 與遊戲內顯示完全相同
          </p>
          <Button
            onClick={handleRegister}
            disabled={
              !gameId.trim() ||
              !coordinate.trim() ||
              registerMutation.isPending
            }
            className="w-full"
          >
            <MapPin className="h-4 w-4 mr-2" />
            註冊銅礦
          </Button>
          {registerMutation.error && (
            <p className="text-sm text-destructive">
              {registerMutation.error.message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            已註冊銅礦 ({mines.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mines.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚未註冊任何銅礦</p>
          ) : (
            <div className="space-y-3">
              {mines.map((mine) => (
                <div
                  key={mine.id}
                  className="flex items-start justify-between py-2 border-b last:border-0"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        Lv.{mine.level} 銅礦
                      </span>
                      <Badge variant="outline">
                        ({mine.coord_x}, {mine.coord_y})
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {mine.game_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(mine.registered_at)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(mine.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
