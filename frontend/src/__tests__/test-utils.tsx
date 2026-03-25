import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import type { SeasonQuotaStatus } from "@/types/season-quota";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

interface WrapperProps {
  readonly children: ReactNode;
}

function createWrapper(queryClient = createTestQueryClient()) {
  return function Wrapper({ children }: WrapperProps) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
) {
  const queryClient = createTestQueryClient();

  return {
    ...render(ui, { wrapper: createWrapper(queryClient), ...options }),
    queryClient,
  };
}

function createMockSeasonQuotaStatus(
  overrides: Partial<SeasonQuotaStatus> = {}
): SeasonQuotaStatus {
  return {
    purchased_seasons: 0,
    used_seasons: 0,
    available_seasons: 0,
    has_trial_available: false,
    current_season_is_trial: false,
    trial_days_remaining: null,
    trial_ends_at: null,
    can_activate_season: true,
    can_write: true,
    ...overrides,
  };
}

export { createMockSeasonQuotaStatus, createTestQueryClient, createWrapper, renderWithProviders };
