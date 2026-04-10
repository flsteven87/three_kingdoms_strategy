import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AllianceGuard } from "../AllianceGuard";
import type { Alliance } from "@/types/alliance";

// Mock hooks and sub-components so tests are isolated
vi.mock("@/hooks/use-alliance", () => ({
  useAlliance: vi.fn(),
}));

import { useAlliance } from "@/hooks/use-alliance";

const mockAlliance: Alliance = {
  id: "alliance-1",
  name: "Test Alliance",
  server_name: "S100",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  purchased_seasons: 0,
  used_seasons: 0,
};

function mockAllianceHook(
  data: Alliance | null | undefined,
  options: { isLoading?: boolean; isFetched?: boolean } = {}
) {
  vi.mocked(useAlliance).mockReturnValue({
    data,
    isLoading: options.isLoading ?? false,
    isFetched: options.isFetched ?? true,
  } as ReturnType<typeof useAlliance>);
}

// =============================================================================
// AllianceGuard
// =============================================================================

describe("AllianceGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Happy path — alliance exists
  // ---------------------------------------------------------------------------

  it("renders children when alliance is available", () => {
    mockAllianceHook(mockAlliance, { isFetched: true });

    render(
      <AllianceGuard>
        <span>alliance content</span>
      </AllianceGuard>
    );

    expect(screen.getByText("alliance content")).toBeInTheDocument();
    expect(screen.queryByTestId("alliance-setup-form")).not.toBeInTheDocument();
  });

  it("renders multiple children when alliance is available", () => {
    mockAllianceHook(mockAlliance, { isFetched: true });

    render(
      <AllianceGuard>
        <span>child one</span>
        <span>child two</span>
      </AllianceGuard>
    );

    expect(screen.getByText("child one")).toBeInTheDocument();
    expect(screen.getByText("child two")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // No alliance — redirect to /setup
  // ---------------------------------------------------------------------------

  it("redirects to /setup when fetch completed with no alliance", () => {
    mockAllianceHook(null, { isFetched: true });

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AllianceGuard>
          <span>hidden content</span>
        </AllianceGuard>
      </MemoryRouter>
    );

    // Navigate renders nothing visible — children should not appear
    expect(screen.queryByText("hidden content")).not.toBeInTheDocument();
  });

  it("does not render children when no alliance", () => {
    mockAllianceHook(null, { isFetched: true });

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AllianceGuard>
          <span>should not render</span>
        </AllianceGuard>
      </MemoryRouter>
    );

    expect(screen.queryByText("should not render")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it("shows loading skeleton instead of children while loading", () => {
    mockAllianceHook(undefined, { isLoading: true, isFetched: false });

    render(
      <AllianceGuard>
        <span>not yet visible</span>
      </AllianceGuard>
    );

    // Content must not be visible while loading
    expect(screen.queryByText("not yet visible")).not.toBeInTheDocument();
    // Setup form must not appear during load either
    expect(screen.queryByTestId("alliance-setup-form")).not.toBeInTheDocument();
  });

  it("does not show setup form while loading even if data is absent", () => {
    mockAllianceHook(undefined, { isLoading: true, isFetched: false });

    render(
      <AllianceGuard>
        <span>children</span>
      </AllianceGuard>
    );

    expect(screen.queryByTestId("alliance-setup-form")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Edge case — fetched but data undefined (e.g. network race)
  // ---------------------------------------------------------------------------

  it("redirects when isFetched is true but data is undefined", () => {
    mockAllianceHook(undefined, { isFetched: true, isLoading: false });

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AllianceGuard>
          <span>hidden</span>
        </AllianceGuard>
      </MemoryRouter>
    );

    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });
});
