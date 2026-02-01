/**
 * LIFF Home Page
 *
 * Compact LIFF page for Tall mode (bottom sheet).
 *
 * User flow:
 * - First-time: OnboardingFlow (forced game ID binding)
 * - Registered: 2-Tab layout (表現, 銅礦) + Header "ID 管理" button
 */

import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useLiffContext } from "../hooks/use-liff-context";
import { useLiffMemberInfo } from "../hooks/use-liff-member";
import { OnboardingFlow } from "./OnboardingFlow";
import { IdManagementPage } from "./IdManagementPage";
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

  const hasRegisteredIds = (memberInfo?.registered_ids?.length ?? 0) > 0;

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
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
      <div className="sticky top-0 z-10 bg-background border-b px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
            {session.lineDisplayName}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setPageView("id-management")}
          >
            <Settings className="h-3.5 w-3.5 mr-1" />
            ID 管理
          </Button>
        </div>
        <TabsList className="grid w-full grid-cols-2 h-9">
          <TabsTrigger value="performance" className="text-sm">
            表現
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
        <TabsContent value="copper" className="m-0">
          <CopperTab session={session} />
        </TabsContent>
      </div>
    </Tabs>
  );
}
