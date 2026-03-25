import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QuotaWarningBanner } from "../QuotaWarningBanner";
import type { QuotaWarningLevel } from "@/types/season-quota";

// Mock react-router-dom so tests run without a Router wrapper
const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

// Mock the quota warning hook
vi.mock("@/hooks/use-season-quota", () => ({
  useQuotaWarning: vi.fn(),
}));

import { useQuotaWarning } from "@/hooks/use-season-quota";

interface MockWarningShape {
  level?: QuotaWarningLevel;
  message?: string | null;
  isExpired?: boolean;
  trialDaysRemaining?: number | null;
  availableSeasons?: number;
}

function mockWarning(overrides: MockWarningShape = {}) {
  vi.mocked(useQuotaWarning).mockReturnValue({
    level: "none",
    message: null,
    isExpired: false,
    trialDaysRemaining: null,
    availableSeasons: 0,
    ...overrides,
  });
}

// =============================================================================
// QuotaWarningBanner
// =============================================================================

describe("QuotaWarningBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Hidden when quota is fine
  // ---------------------------------------------------------------------------

  it("renders nothing when warning level is none", () => {
    mockWarning({ level: "none", message: null });

    const { container } = render(<QuotaWarningBanner />);

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when level is none even with a message string", () => {
    // Defensive: ensure the level check takes priority over message content
    mockWarning({ level: "none", message: "some text" });

    const { container } = render(<QuotaWarningBanner />);

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when message is null regardless of level", () => {
    // Edge case: level is set but message is somehow null
    mockWarning({ level: "warning", message: null });

    const { container } = render(<QuotaWarningBanner />);

    expect(container.firstChild).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Warning level (yellow — 7 days or less)
  // ---------------------------------------------------------------------------

  it("shows warning banner with correct message text", () => {
    mockWarning({ level: "warning", message: "試用期剩餘 7 天" });

    render(<QuotaWarningBanner />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("試用期剩餘 7 天")).toBeInTheDocument();
  });

  it("shows purchase button in warning state", () => {
    mockWarning({ level: "warning", message: "試用期剩餘 5 天" });

    render(<QuotaWarningBanner />);

    expect(screen.getByRole("button", { name: "購買賽季" })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Critical level (orange — 3 days or less)
  // ---------------------------------------------------------------------------

  it("shows critical banner with correct message text", () => {
    mockWarning({ level: "critical", message: "試用期剩餘 2 天" });

    render(<QuotaWarningBanner />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("試用期剩餘 2 天")).toBeInTheDocument();
  });

  it("shows purchase button in critical state", () => {
    mockWarning({ level: "critical", message: "試用期剩餘 1 天" });

    render(<QuotaWarningBanner />);

    expect(screen.getByRole("button", { name: "購買賽季" })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Expired level (red)
  // ---------------------------------------------------------------------------

  it("shows expired banner with correct message text", () => {
    mockWarning({ level: "expired", message: "試用期已結束，歡迎購買賽季繼續使用", isExpired: true });

    render(<QuotaWarningBanner />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("試用期已結束，歡迎購買賽季繼續使用")).toBeInTheDocument();
  });

  it("shows purchase button in expired state", () => {
    mockWarning({ level: "expired", message: "試用期已結束，歡迎購買賽季繼續使用", isExpired: true });

    render(<QuotaWarningBanner />);

    expect(screen.getByRole("button", { name: "購買賽季" })).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Navigation on purchase button click
  // ---------------------------------------------------------------------------

  it("navigates to /purchase when purchase button is clicked", async () => {
    const user = userEvent.setup();
    mockWarning({ level: "expired", message: "試用期已結束，歡迎購買賽季繼續使用", isExpired: true });

    render(<QuotaWarningBanner />);

    await user.click(screen.getByRole("button", { name: "購買賽季" }));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/purchase");
  });

  it("navigates to /purchase from warning state too", async () => {
    const user = userEvent.setup();
    mockWarning({ level: "warning", message: "試用期剩餘 6 天" });

    render(<QuotaWarningBanner />);

    await user.click(screen.getByRole("button", { name: "購買賽季" }));

    expect(mockNavigate).toHaveBeenCalledWith("/purchase");
  });

  // ---------------------------------------------------------------------------
  // Accessibility
  // ---------------------------------------------------------------------------

  it("banner element has role alert", () => {
    mockWarning({ level: "critical", message: "試用期剩餘 2 天" });

    render(<QuotaWarningBanner />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
