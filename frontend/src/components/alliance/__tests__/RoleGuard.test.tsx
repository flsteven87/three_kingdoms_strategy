import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RoleGuard } from "../RoleGuard";
import type { UserRole } from "@/hooks/use-user-role";

vi.mock("@/hooks/use-user-role", () => ({
  useUserRole: vi.fn(),
}));

import { useUserRole } from "@/hooks/use-user-role";

function mockRole(role: UserRole | undefined, isLoading = false) {
  vi.mocked(useUserRole).mockReturnValue({
    data: role,
    isLoading,
  } as ReturnType<typeof useUserRole>);
}

// =============================================================================
// RoleGuard
// =============================================================================

describe("RoleGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Happy path — role matches
  // ---------------------------------------------------------------------------

  it("renders children when user role is in requiredRoles", () => {
    mockRole("owner");

    render(
      <RoleGuard requiredRoles={["owner"]}>
        <span>owner content</span>
      </RoleGuard>
    );

    expect(screen.getByText("owner content")).toBeInTheDocument();
  });

  it("renders children for collaborator when collaborator is required", () => {
    mockRole("collaborator");

    render(
      <RoleGuard requiredRoles={["collaborator"]}>
        <span>collaborator content</span>
      </RoleGuard>
    );

    expect(screen.getByText("collaborator content")).toBeInTheDocument();
  });

  it("renders children for member when member is required", () => {
    mockRole("member");

    render(
      <RoleGuard requiredRoles={["member"]}>
        <span>member content</span>
      </RoleGuard>
    );

    expect(screen.getByText("member content")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Multiple allowed roles
  // ---------------------------------------------------------------------------

  it("renders children when user is owner and both owner and collaborator are allowed", () => {
    mockRole("owner");

    render(
      <RoleGuard requiredRoles={["owner", "collaborator"]}>
        <span>write access</span>
      </RoleGuard>
    );

    expect(screen.getByText("write access")).toBeInTheDocument();
  });

  it("renders children when user is collaborator and both owner and collaborator are allowed", () => {
    mockRole("collaborator");

    render(
      <RoleGuard requiredRoles={["owner", "collaborator"]}>
        <span>write access</span>
      </RoleGuard>
    );

    expect(screen.getByText("write access")).toBeInTheDocument();
  });

  it("renders children when all three roles are allowed", () => {
    mockRole("member");

    render(
      <RoleGuard requiredRoles={["owner", "collaborator", "member"]}>
        <span>read only content</span>
      </RoleGuard>
    );

    expect(screen.getByText("read only content")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Permission denied — role does not match
  // ---------------------------------------------------------------------------

  it("hides children when user role is not in requiredRoles", () => {
    mockRole("member");

    render(
      <RoleGuard requiredRoles={["owner"]}>
        <span>restricted content</span>
      </RoleGuard>
    );

    expect(screen.queryByText("restricted content")).not.toBeInTheDocument();
  });

  it("hides children when collaborator tries to access owner-only content", () => {
    mockRole("collaborator");

    render(
      <RoleGuard requiredRoles={["owner"]}>
        <span>delete button</span>
      </RoleGuard>
    );

    expect(screen.queryByText("delete button")).not.toBeInTheDocument();
  });

  it("hides children when member tries to access write content", () => {
    mockRole("member");

    render(
      <RoleGuard requiredRoles={["owner", "collaborator"]}>
        <span>upload area</span>
      </RoleGuard>
    );

    expect(screen.queryByText("upload area")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Fallback content
  // ---------------------------------------------------------------------------

  it("renders fallback when role does not match and fallback is provided", () => {
    mockRole("member");

    render(
      <RoleGuard requiredRoles={["owner"]} fallback={<span>無權限</span>}>
        <span>restricted</span>
      </RoleGuard>
    );

    expect(screen.getByText("無權限")).toBeInTheDocument();
    expect(screen.queryByText("restricted")).not.toBeInTheDocument();
  });

  it("renders null (nothing) by default when role does not match and no fallback", () => {
    mockRole("member");

    const { container } = render(
      <RoleGuard requiredRoles={["owner"]}>
        <span>restricted</span>
      </RoleGuard>
    );

    expect(screen.queryByText("restricted")).not.toBeInTheDocument();
    // The fallback defaults to null so the container should be empty
    expect(container.firstChild).toBeNull();
  });

  it("does not render fallback when user has required role", () => {
    mockRole("owner");

    render(
      <RoleGuard requiredRoles={["owner"]} fallback={<span>fallback text</span>}>
        <span>permitted content</span>
      </RoleGuard>
    );

    expect(screen.getByText("permitted content")).toBeInTheDocument();
    expect(screen.queryByText("fallback text")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it("renders nothing while role is loading", () => {
    mockRole(undefined, true);

    const { container } = render(
      <RoleGuard requiredRoles={["owner"]}>
        <span>protected</span>
      </RoleGuard>
    );

    expect(screen.queryByText("protected")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing (not fallback) while loading even with fallback provided", () => {
    mockRole(undefined, true);

    render(
      <RoleGuard requiredRoles={["owner"]} fallback={<span>no permission</span>}>
        <span>protected</span>
      </RoleGuard>
    );

    expect(screen.queryByText("no permission")).not.toBeInTheDocument();
    expect(screen.queryByText("protected")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Edge case — role undefined after load (no alliance)
  // ---------------------------------------------------------------------------

  it("hides children when role is undefined after loading completes", () => {
    mockRole(undefined, false);

    render(
      <RoleGuard requiredRoles={["owner"]}>
        <span>content</span>
      </RoleGuard>
    );

    expect(screen.queryByText("content")).not.toBeInTheDocument();
  });
});
