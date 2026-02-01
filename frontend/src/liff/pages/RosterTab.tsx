/**
 * Roster Tab
 *
 * Compact game ID registration for LIFF Tall mode with autocomplete.
 */

import { useState } from "react";
import { Plus, Check, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useLiffMemberInfo,
  useLiffMemberCandidates,
  useLiffRegisterMember,
  useLiffUnregisterMember,
  useLiffSimilarMembers,
} from "../hooks/use-liff-member";
import type { LiffSession } from "../hooks/use-liff-session";
import type { MemberCandidate } from "../lib/liff-api-client";

interface Props {
  readonly session: LiffSession;
}

export function RosterTab({ session }: Props) {
  const [newGameId, setNewGameId] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [showSuggestionDialog, setShowSuggestionDialog] = useState(false);
  const [pendingGameId, setPendingGameId] = useState("");

  const context = {
    lineUserId: session.lineUserId,
    lineGroupId: session.lineGroupId!,
    lineDisplayName: session.lineDisplayName,
  };

  const { data, isLoading, error } = useLiffMemberInfo(context);
  const { data: candidatesData } = useLiffMemberCandidates(session.lineGroupId);
  const { data: similarData } = useLiffSimilarMembers(
    session.lineGroupId,
    pendingGameId,
  );
  const registerMutation = useLiffRegisterMember(context);
  const unregisterMutation = useLiffUnregisterMember(context);

  const candidates = candidatesData?.candidates ?? [];
  const similarMembers = similarData?.similar ?? [];
  const hasExactMatch = similarData?.has_exact_match ?? false;

  // Filter candidates based on input
  const filteredCandidates = newGameId.trim()
    ? candidates
        .filter((c) =>
          c.name.toLowerCase().includes(newGameId.toLowerCase().trim()),
        )
        .slice(0, 5)
    : [];

  const handleRegister = async () => {
    const trimmedId = newGameId.trim();
    if (!trimmedId) return;

    // Check if input matches a known member
    const isKnownMember = candidates.some((c) => c.name === trimmedId);

    if (isKnownMember) {
      // Direct register if exact match
      await doRegister(trimmedId);
    } else {
      // Show suggestion dialog if not exact match
      setPendingGameId(trimmedId);
      setShowSuggestionDialog(true);
    }
  };

  const doRegister = async (gameId: string) => {
    try {
      await registerMutation.mutateAsync({ gameId });
      setNewGameId("");
      setShowSuggestionDialog(false);
      setPendingGameId("");
    } catch {
      // Error handled by mutation
    }
  };

  const handleSelectSuggestion = (candidate: MemberCandidate) => {
    setNewGameId(candidate.name);
    setShowSuggestionDialog(false);
    setPendingGameId("");
  };

  const handleConfirmUnknown = async () => {
    await doRegister(pendingGameId);
  };

  const handleUnregister = async (gameId: string) => {
    setDeletingId(gameId);
    try {
      await unregisterMutation.mutateAsync({ gameId });
    } catch {
      // Error handled by mutation
    } finally {
      setDeletingId(null);
    }
  };

  const handleSelectCandidate = (candidate: MemberCandidate) => {
    setNewGameId(candidate.name);
    setIsAutocompleteOpen(false);
  };

  if (isLoading) {
    return (
      <div className="py-6 text-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 text-center text-sm text-destructive">
        {error.message}
      </div>
    );
  }

  const accounts = data?.registered_ids || [];

  return (
    <div className="p-3 space-y-3">
      {/* Input form with autocomplete */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">角色名稱（非數字編號）</p>
        <div className="flex gap-2">
          <Popover
            open={isAutocompleteOpen}
            onOpenChange={setIsAutocompleteOpen}
          >
            <PopoverTrigger asChild>
              <div className="flex-1">
                <Input
                  value={newGameId}
                  onChange={(e) => {
                    setNewGameId(e.target.value);
                    if (e.target.value.trim()) {
                      setIsAutocompleteOpen(true);
                    }
                  }}
                  onFocus={() => {
                    if (newGameId.trim()) {
                      setIsAutocompleteOpen(true);
                    }
                  }}
                  placeholder="例：曹操丞相"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isAutocompleteOpen) {
                      handleRegister();
                    }
                    if (e.key === "Escape") {
                      setIsAutocompleteOpen(false);
                    }
                  }}
                  className="h-10"
                />
              </div>
            </PopoverTrigger>
            {filteredCandidates.length > 0 && (
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <Command>
                  <CommandList>
                    <CommandGroup>
                      {filteredCandidates.map((candidate) => (
                        <CommandItem
                          key={candidate.name}
                          value={candidate.name}
                          onSelect={() => handleSelectCandidate(candidate)}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center justify-between w-full">
                            <span>{candidate.name}</span>
                            {candidate.group_name && (
                              <span className="text-xs text-muted-foreground">
                                {candidate.group_name}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            )}
            {filteredCandidates.length === 0 &&
              newGameId.trim() &&
              isAutocompleteOpen && (
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0"
                  align="start"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                >
                  <Command>
                    <CommandList>
                      <CommandEmpty className="py-3 text-xs">
                        無符合結果，按 Enter 可直接註冊
                      </CommandEmpty>
                    </CommandList>
                  </Command>
                </PopoverContent>
              )}
          </Popover>
          <Button
            onClick={handleRegister}
            disabled={!newGameId.trim() || registerMutation.isPending}
            size="icon"
            className="h-10 w-10 shrink-0"
          >
            {registerMutation.isPending ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {(registerMutation.error || unregisterMutation.error) && (
        <p className="text-xs text-destructive">
          {registerMutation.error?.message || unregisterMutation.error?.message}
        </p>
      )}

      {/* Registered accounts list */}
      <div className="pt-2">
        <div className="text-xs text-muted-foreground mb-2">
          已註冊 ({accounts.length})
        </div>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            尚未註冊帳號
          </p>
        ) : (
          <div className="space-y-1">
            {accounts.map((acc) => (
              <div
                key={`${acc.game_id}-${acc.created_at}`}
                className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  {acc.is_verified ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  )}
                  <span className="text-sm font-medium">{acc.game_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      acc.is_verified
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {acc.is_verified ? "已匹配" : "待匹配"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={() => handleUnregister(acc.game_id)}
                    disabled={deletingId === acc.game_id}
                  >
                    {deletingId === acc.game_id ? (
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggestion Dialog */}
      <Dialog
        open={showSuggestionDialog}
        onOpenChange={setShowSuggestionDialog}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {similarMembers.length > 0 && !hasExactMatch
                ? `找不到「${pendingGameId}」`
                : `「${pendingGameId}」尚未在系統中`}
            </DialogTitle>
            <DialogDescription>
              {similarMembers.length > 0 && !hasExactMatch
                ? "您是否要找："
                : "確定要註冊嗎？"}
            </DialogDescription>
          </DialogHeader>

          {similarMembers.length > 0 && !hasExactMatch && (
            <div className="flex flex-wrap gap-2">
              {similarMembers.map((candidate) => (
                <Button
                  key={candidate.name}
                  variant="outline"
                  size="sm"
                  onClick={() => handleSelectSuggestion(candidate)}
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
              onClick={handleConfirmUnknown}
              disabled={registerMutation.isPending}
              className="w-full text-muted-foreground"
            >
              {registerMutation.isPending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
              ) : null}
              仍要使用「{pendingGameId}」註冊
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
