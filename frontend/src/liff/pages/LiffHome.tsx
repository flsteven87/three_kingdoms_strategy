/**
 * LIFF Home Page
 *
 * Compact LIFF page for Tall mode (bottom sheet).
 *
 * User flow:
 * - First-time: OnboardingFlow (forced game ID binding)
 * - Registered: 3-Tab layout (表現, 戰役, 銅礦) + Header "ID 管理" button
 */

import { useState, useEffect } from "react";
import { ChevronRight, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { liffTypography } from "@/lib/typography";
import { useLiffContext } from "../hooks/use-liff-context";
import { useLiffMemberInfo } from "../hooks/use-liff-member";
import { OnboardingFlow } from "./OnboardingFlow";
import { IdManagementPage } from "./IdManagementPage";
import { BattleTab } from "./BattleTab";
import { CopperTab } from "./CopperTab";
import { PerformanceTab } from "./PerformanceTab";

type PageView = "main" | "id-management";

export function LiffHome() {
  const { session } = useLiffContext();
  const [activeTab, setActiveTab] = useState("performance");
  const [pageView, setPageView] = useState<PageView>("main");

  // Onboarding state: null = not determined, true = show, false = hide
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  const context = {
    lineUserId: session.lineUserId,
    lineGroupId: session.lineGroupId,
    lineDisplayName: session.lineDisplayName,
  };

  const { data: memberInfo, isLoading } = useLiffMemberInfo(context);

  const registeredIds = memberInfo?.registered_ids ?? [];
  const hasRegisteredIds = registeredIds.length > 0;
  const unverifiedCount = registeredIds.filter(
    (acc) => !acc.is_verified,
  ).length;
  const totalCount = registeredIds.length;

  // Initialize onboarding state after loading
  useEffect(() => {
    if (!isLoading && showOnboarding === null) {
      setShowOnboarding(!hasRegisteredIds);
    }
  }, [isLoading, hasRegisteredIds, showOnboarding]);

  // Re-trigger onboarding if user deletes all accounts
  useEffect(() => {
    if (!isLoading && !hasRegisteredIds && showOnboarding === false) {
      setShowOnboarding(true);
    }
  }, [isLoading, hasRegisteredIds, showOnboarding]);

  // Handle onboarding completion - wait for animation before showing main view
  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  // Loading state (initial load or onboarding state not determined)
  if (isLoading || showOnboarding === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Show onboarding (state-controlled, not directly from hasRegisteredIds)
  if (showOnboarding) {
    return (
      <OnboardingFlow session={session} onComplete={handleOnboardingComplete} />
    );
  }

  // ID Management page (full screen)
  if (pageView === "id-management") {
    return (
      <IdManagementPage session={session} onBack={() => setPageView("main")} />
    );
  }

  // Main view with 2-tab layout
  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex flex-col h-full"
    >
      {/* Sticky header with tabs */}
      <div className="sticky top-0 z-10 bg-background border-b px-3 py-3">
        {/* Welcome section */}
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0 flex-1">
            <p className={`${liffTypography.cardTitle} truncate`}>
              {session.lineDisplayName} 主公您好
            </p>
            {unverifiedCount > 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mt-0.5">
                <AlertCircle className="h-4 w-4" />
                {unverifiedCount} 個帳號待匹配
              </p>
            ) : (
              <p className={`${liffTypography.caption} mt-0.5`}>
                已綁定 {totalCount} 個帳號
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => setPageView("id-management")}
          >
            ID 管理
            <ChevronRight className="h-4 w-4 ml-0.5" />
          </Button>
        </div>
        <TabsList className="grid w-full grid-cols-3 h-9">
          <TabsTrigger value="performance" className="text-sm">
            表現
          </TabsTrigger>
          <TabsTrigger value="battle" className="text-sm">
            戰役
          </TabsTrigger>
          <TabsTrigger value="copper" className="text-sm">
            銅礦
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        <TabsContent value="performance" className="m-0">
          <PerformanceTab session={session} />
        </TabsContent>
        <TabsContent value="battle" className="m-0">
          <BattleTab session={session} />
        </TabsContent>
        <TabsContent value="copper" className="m-0">
          <CopperTab session={session} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
