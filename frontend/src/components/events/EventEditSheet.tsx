/**
 * EventEditSheet - Side panel for editing event basic information
 *
 * Allows editing: name, event_type, description
 * Read-only: time range (from CSV timestamps)
 *
 * Follows CLAUDE.md:
 * - Explicit prop interfaces
 * - No React.FC
 * - ES imports only
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Loader2, Clock } from "lucide-react";
import { useEvent, useUpdateEvent } from "@/hooks/use-events";
import { formatEventTime } from "@/lib/event-utils";
import type { EventListItem, EventCategory } from "@/types/event";

// ============================================================================
// Types
// ============================================================================

interface EventEditSheetProps {
  readonly event: EventListItem | null;
  readonly seasonId: string | undefined;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

interface FormState {
  name: string;
  eventType: EventCategory;
  description: string;
}

// ============================================================================
// Constants
// ============================================================================

const EVENT_TYPE_OPTIONS: { value: EventCategory; label: string }[] = [
  { value: "battle", label: "戰役事件 - 以戰功判定出席" },
  { value: "siege", label: "攻城事件 - 以貢獻/助攻判定出席" },
  { value: "forbidden", label: "禁地事件 - 監控勢力值違規" },
];

// ============================================================================
// Component
// ============================================================================

export function EventEditSheet({
  event,
  seasonId,
  open,
  onOpenChange,
}: EventEditSheetProps) {
  // Form state
  const [formState, setFormState] = useState<FormState>({
    name: "",
    eventType: "battle",
    description: "",
  });

  // Fetch full event data to get description
  const { data: fullEvent } = useEvent(open && event ? event.id : undefined);

  // Mutation
  const updateEvent = useUpdateEvent(seasonId);

  // Reset form when event or fullEvent changes
  useEffect(() => {
    if (event) {
      setFormState({
        name: event.name,
        eventType: event.event_type,
        description: fullEvent?.description ?? "",
      });
    }
  }, [event, fullEvent]);

  // Original description for dirty check
  const originalDescription = fullEvent?.description ?? "";

  // Computed values
  const isDirty =
    event &&
    (formState.name !== event.name ||
      formState.eventType !== event.event_type ||
      formState.description.trim() !== originalDescription.trim());

  const eventTypeChanged = event && formState.eventType !== event.event_type;

  const canSubmit =
    formState.name.trim().length > 0 &&
    formState.name.trim().length <= 100 &&
    formState.description.length <= 500 &&
    !updateEvent.isPending;

  // Handlers
  const handleSubmit = async () => {
    if (!event || !canSubmit) return;

    try {
      await updateEvent.mutateAsync({
        eventId: event.id,
        data: {
          name: formState.name.trim(),
          event_type: formState.eventType,
          description: formState.description.trim() || null,
        },
      });

      toast.success("事件已更新", {
        description: `「${formState.name}」的資訊已儲存`,
      });

      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "更新失敗，請稍後再試";
      toast.error("更新失敗", { description: message });
    }
  };

  const handleClose = () => {
    // Could add dirty state confirmation here if needed
    onOpenChange(false);
  };

  if (!event) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>編輯事件</SheetTitle>
          <SheetDescription>修改事件的基本資訊</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Event Name */}
          <div className="space-y-2">
            <Label htmlFor="event-name">事件名稱 *</Label>
            <Input
              id="event-name"
              value={formState.name}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="例如：徐州爭奪戰"
              maxLength={100}
              disabled={updateEvent.isPending}
            />
            {formState.name.trim().length === 0 && (
              <p className="text-xs text-destructive">事件名稱不可為空</p>
            )}
          </div>

          {/* Event Type */}
          <div className="space-y-2">
            <Label htmlFor="event-type">事件類型 *</Label>
            <Select
              value={formState.eventType}
              onValueChange={(value: EventCategory) =>
                setFormState((prev) => ({ ...prev, eventType: value }))
              }
              disabled={updateEvent.isPending}
            >
              <SelectTrigger id="event-type">
                <SelectValue placeholder="選擇事件類型" />
              </SelectTrigger>
              <SelectContent>
                {EVENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Event Type Change Warning */}
            {eventTypeChanged && (
              <Alert className="border-yellow-500/50 bg-yellow-500/10">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-700 dark:text-yellow-400">
                  更改事件類型會影響：
                  <ul className="mt-1 ml-4 list-disc text-xs">
                    <li>參與判定邏輯（戰功/貢獻/勢力值）</li>
                    <li>MVP 計算方式</li>
                    <li>LINE Bot 報告格式</li>
                  </ul>
                  已計算的指標數據不會重新計算。
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="event-description">事件描述</Label>
            <Textarea
              id="event-description"
              value={formState.description}
              onChange={(e) =>
                setFormState((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="可選，最多 500 字"
              rows={3}
              maxLength={500}
              disabled={updateEvent.isPending}
            />
            <p className="text-xs text-muted-foreground">
              {formState.description.length}/500 字
            </p>
          </div>

          {/* Time Info (Read-only) */}
          <div className="space-y-2 border-t pt-4">
            <Label className="text-muted-foreground">
              時間資訊（僅供參考）
            </Label>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>{formatEventTime(event.event_start, event.event_end)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              來源：CSV 檔案時間戳
            </p>
          </div>
        </div>

        <SheetFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={updateEvent.isPending}
          >
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || !isDirty}>
            {updateEvent.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                儲存中...
              </>
            ) : (
              "儲存變更"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
