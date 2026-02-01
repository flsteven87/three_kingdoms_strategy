/**
 * Onboarding Flow
 *
 * First-time user experience for game ID registration.
 * Shows fullscreen flow until at least one game ID is bound.
 */

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useLiffMemberCandidates,
  useLiffRegisterMember,
  useLiffSimilarMembers,
} from "../hooks/use-liff-member";
import type { LiffSessionWithGroup } from "../hooks/use-liff-session";
import type { MemberCandidate } from "../lib/liff-api-client";
import { GameIdAutocomplete } from "../components/GameIdAutocomplete";
import { SuggestionDialog } from "../components/SuggestionDialog";

const SUCCESS_ANIMATION_DURATION = 800;

interface Props {
  readonly session: LiffSessionWithGroup;
  readonly onComplete: () => void;
}

export function OnboardingFlow({ session, onComplete }: Props) {
  const [gameId, setGameId] = useState("");
  const [showSuggestionDialog, setShowSuggestionDialog] = useState(false);
  const [pendingGameId, setPendingGameId] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const context = {
    lineUserId: session.lineUserId,
    lineGroupId: session.lineGroupId,
    lineDisplayName: session.lineDisplayName,
  };

  const { data: candidatesData } = useLiffMemberCandidates(session.lineGroupId);
  const { data: similarData } = useLiffSimilarMembers(
    session.lineGroupId,
    pendingGameId,
  );
  const registerMutation = useLiffRegisterMember(context);

  const candidates = candidatesData?.candidates ?? [];
  const similarMembers = similarData?.similar ?? [];
  const hasExactMatch = similarData?.has_exact_match ?? false;

  const handleRegister = async () => {
    const trimmedId = gameId.trim();
    if (!trimmedId) return;

    const isKnownMember = candidates.some((c) => c.name === trimmedId);

    if (isKnownMember) {
      await doRegister(trimmedId);
    } else {
      setPendingGameId(trimmedId);
      setShowSuggestionDialog(true);
    }
  };

  const doRegister = async (targetGameId: string) => {
    try {
      await registerMutation.mutateAsync({ gameId: targetGameId });
      setGameId("");
      setShowSuggestionDialog(false);
      setPendingGameId("");

      // Show success animation then complete
      setShowSuccess(true);
      setTimeout(() => {
        onComplete();
      }, SUCCESS_ANIMATION_DURATION);
    } catch {
      // Error handled by mutation
    }
  };

  const handleSelectSuggestion = (candidate: MemberCandidate) => {
    setGameId(candidate.name);
    setShowSuggestionDialog(false);
    setPendingGameId("");
  };

  const handleConfirmUnknown = async () => {
    await doRegister(pendingGameId);
  };

  const handleSelectCandidate = (candidate: MemberCandidate) => {
    setGameId(candidate.name);
  };

  // Success state with animation
  if (showSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 animate-in fade-in duration-300">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4 animate-in zoom-in duration-300">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <p className="text-lg font-medium text-foreground">綁定成功</p>
        <p className="text-sm text-muted-foreground mt-1">正在載入...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 text-center">
        <h1 className="text-xl font-semibold text-foreground">綁定遊戲帳號</h1>
        <p className="text-sm text-muted-foreground mt-2">
          綁定後即可查看表現數據與管理銅礦
        </p>
      </div>

      {/* Form */}
      <div className="flex-1 px-4 pt-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              遊戲角色名稱
            </label>
            <p className="text-xs text-muted-foreground">
              請輸入遊戲內的角色名稱（非數字編號）
            </p>
          </div>

          <div className="flex gap-2">
            <GameIdAutocomplete
              value={gameId}
              onChange={setGameId}
              onSelect={handleSelectCandidate}
              onSubmit={handleRegister}
              candidates={candidates}
              className="h-12 text-base"
              autoFocus
            />
          </div>

          {registerMutation.error && (
            <p className="text-sm text-destructive">
              {registerMutation.error.message}
            </p>
          )}

          <Button
            onClick={handleRegister}
            disabled={!gameId.trim() || registerMutation.isPending}
            className="w-full h-12 text-base"
          >
            {registerMutation.isPending ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
            ) : (
              <Plus className="h-5 w-5 mr-2" />
            )}
            綁定帳號
          </Button>
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-4 py-4 text-center">
        <p className="text-xs text-muted-foreground">
          {session.lineDisplayName}，歡迎使用
        </p>
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
