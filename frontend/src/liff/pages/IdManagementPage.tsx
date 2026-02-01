/**
 * ID Management Page
 *
 * Full-screen page for managing game ID registrations.
 * Accessed via header "ID 管理" button.
 */

import { useState } from "react";
import { ArrowLeft, Plus, Check, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { LiffSessionWithGroup } from "../hooks/use-liff-session";
import type {
  MemberCandidate,
  RegisteredAccount,
} from "../lib/liff-api-client";
import { GameIdAutocomplete } from "../components/GameIdAutocomplete";
import { SuggestionDialog } from "../components/SuggestionDialog";

// ============================================================================
// UnverifiedAccountItem - Shows suggestions for unverified game IDs
// ============================================================================

interface UnverifiedAccountItemProps {
  readonly account: RegisteredAccount;
  readonly lineGroupId: string;
  readonly onCorrect: (oldGameId: string, newGameId: string) => Promise<void>;
  readonly onDelete: (gameId: string) => void;
  readonly isDeleting: boolean;
  readonly isCorrectingId: string | null;
}

function UnverifiedAccountItem({
  account,
  lineGroupId,
  onCorrect,
  onDelete,
  isDeleting,
  isCorrectingId,
}: UnverifiedAccountItemProps) {
  const [showCorrectDialog, setShowCorrectDialog] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] =
    useState<MemberCandidate | null>(null);

  const { data: similarData } = useLiffSimilarMembers(
    lineGroupId,
    account.game_id,
  );
  const suggestions = (similarData?.similar ?? []).slice(0, 3);

  const handleSuggestionClick = (candidate: MemberCandidate) => {
    setSelectedSuggestion(candidate);
    setShowCorrectDialog(true);
  };

  const handleConfirmCorrect = async () => {
    if (!selectedSuggestion) return;
    await onCorrect(account.game_id, selectedSuggestion.name);
    setShowCorrectDialog(false);
    setSelectedSuggestion(null);
  };

  const isProcessing = isCorrectingId === account.game_id;

  return (
    <>
      <div className="py-2 px-3 bg-muted/50 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-sm font-medium">{account.game_id}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              待匹配
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(account.game_id)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {suggestions.length > 0 && (
          <div className="mt-2 pl-6">
            <p className="text-xs text-muted-foreground mb-1">你可能是指：</p>
            <div className="space-y-1">
              {suggestions.map((candidate) => (
                <button
                  key={candidate.name}
                  type="button"
                  onClick={() => handleSuggestionClick(candidate)}
                  disabled={isProcessing}
                  className="flex items-center justify-between w-full text-left text-xs py-1 px-2 rounded hover:bg-muted cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="text-foreground">{candidate.name}</span>
                  {candidate.group_name && (
                    <span className="text-muted-foreground shrink-0 ml-4">
                      {candidate.group_name}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={showCorrectDialog} onOpenChange={setShowCorrectDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>修正綁定</DialogTitle>
            <DialogDescription>
              確定要將「{account.game_id}」綁定改為「{selectedSuggestion?.name}
              」嗎？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCorrectDialog(false)}
              disabled={isProcessing}
              className="flex-1"
            >
              取消
            </Button>
            <Button
              onClick={handleConfirmCorrect}
              disabled={isProcessing}
              className="flex-1"
            >
              {isProcessing && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
              )}
              確認修正
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================================
// VerifiedAccountItem - Simple display for verified game IDs
// ============================================================================

interface VerifiedAccountItemProps {
  readonly account: RegisteredAccount;
  readonly onDelete: (gameId: string) => void;
  readonly isDeleting: boolean;
}

function VerifiedAccountItem({
  account,
  onDelete,
  isDeleting,
}: VerifiedAccountItemProps) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
      <div className="flex items-center gap-2">
        <Check className="h-3.5 w-3.5 text-green-600" />
        <span className="text-sm font-medium">{account.game_id}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">
          已匹配
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete(account.game_id)}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

interface Props {
  readonly session: LiffSessionWithGroup;
  readonly onBack: () => void;
}

export function IdManagementPage({ session, onBack }: Props) {
  const [newGameId, setNewGameId] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [showSuggestionDialog, setShowSuggestionDialog] = useState(false);
  const [pendingGameId, setPendingGameId] = useState("");

  const context = {
    lineUserId: session.lineUserId,
    lineGroupId: session.lineGroupId,
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

  const handleRegister = async () => {
    const trimmedId = newGameId.trim();
    if (!trimmedId) return;

    const isKnownMember = candidates.some((c) => c.name === trimmedId);

    if (isKnownMember) {
      await doRegister(trimmedId);
    } else {
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
  };

  const handleCorrect = async (oldGameId: string, targetGameId: string) => {
    setCorrectingId(oldGameId);
    try {
      await unregisterMutation.mutateAsync({ gameId: oldGameId });
      await registerMutation.mutateAsync({ gameId: targetGameId });
    } catch {
      // Error handled by mutations
    } finally {
      setCorrectingId(null);
    }
  };

  const accounts = data?.registered_ids || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-3 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-base font-medium">ID 管理</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Input form with autocomplete */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">新增帳號（角色名稱）</p>
          <div className="flex gap-2">
            <GameIdAutocomplete
              value={newGameId}
              onChange={setNewGameId}
              onSelect={handleSelectCandidate}
              onSubmit={handleRegister}
              candidates={candidates}
            />
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
            {registerMutation.error?.message ||
              unregisterMutation.error?.message}
          </p>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="py-6 text-center">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="p-3 text-center text-sm text-destructive">
            {error.message}
          </div>
        )}

        {/* Registered accounts list */}
        {!isLoading && !error && (
          <div className="pt-2">
            <div className="text-xs text-muted-foreground mb-2">
              已註冊帳號 ({accounts.length})
            </div>
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                尚未註冊帳號
              </p>
            ) : (
              <div className="space-y-1">
                {accounts.map((acc) =>
                  acc.is_verified ? (
                    <VerifiedAccountItem
                      key={`${acc.game_id}-${acc.created_at}`}
                      account={acc}
                      onDelete={handleUnregister}
                      isDeleting={deletingId === acc.game_id}
                    />
                  ) : (
                    <UnverifiedAccountItem
                      key={`${acc.game_id}-${acc.created_at}`}
                      account={acc}
                      lineGroupId={session.lineGroupId}
                      onCorrect={handleCorrect}
                      onDelete={handleUnregister}
                      isDeleting={deletingId === acc.game_id}
                      isCorrectingId={correctingId}
                    />
                  ),
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Suggestion Dialog */}
      <SuggestionDialog
        open={showSuggestionDialog}
        onOpenChange={setShowSuggestionDialog}
        pendingGameId={pendingGameId}
        similarMembers={similarMembers}
        hasExactMatch={hasExactMatch}
        onSelectSuggestion={handleSelectSuggestion}
        onConfirmUnknown={handleConfirmUnknown}
        isLoading={registerMutation.isPending}
      />
    </div>
  );
}
