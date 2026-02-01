/**
 * Suggestion Dialog
 *
 * Dialog shown when user enters an unknown game ID.
 * Suggests similar members or allows confirming the unknown ID.
 */

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MemberCandidate } from "../lib/liff-api-client";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly pendingGameId: string;
  readonly similarMembers: readonly MemberCandidate[];
  readonly hasExactMatch: boolean;
  readonly onSelectSuggestion: (candidate: MemberCandidate) => void;
  readonly onConfirmUnknown: () => void;
  readonly isLoading: boolean;
}

export function SuggestionDialog({
  open,
  onOpenChange,
  pendingGameId,
  similarMembers,
  hasExactMatch,
  onSelectSuggestion,
  onConfirmUnknown,
  isLoading,
}: Props) {
  const showSuggestions = similarMembers.length > 0 && !hasExactMatch;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {showSuggestions
              ? `找不到「${pendingGameId}」`
              : `「${pendingGameId}」尚未在系統中`}
          </DialogTitle>
          <DialogDescription>
            {showSuggestions ? "您是否要找：" : "確定要註冊嗎？"}
          </DialogDescription>
        </DialogHeader>

        {showSuggestions && (
          <div className="flex flex-wrap gap-2">
            {similarMembers.map((candidate) => (
              <Button
                key={candidate.name}
                variant="outline"
                size="sm"
                onClick={() => onSelectSuggestion(candidate)}
                className="flex flex-col items-start h-auto py-2 px-3"
              >
                <span className="font-medium">{candidate.name}</span>
                {candidate.group_name && (
                  <span className="text-xs text-muted-foreground">
                    {candidate.group_name}
                  </span>
                )}
              </Button>
            ))}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onConfirmUnknown}
            disabled={isLoading}
            className="w-full text-muted-foreground"
          >
            {isLoading && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
            )}
            仍要使用「{pendingGameId}」註冊
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
