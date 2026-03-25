import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useAuth } from "../use-auth";
import { AuthContext, type AuthContextType } from "@/contexts/auth-context-definition";
import type { ReactNode } from "react";

function createAuthWrapper(value: AuthContextType) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
  };
}

const mockAuthContext: AuthContextType = {
  user: null,
  session: null,
  loading: false,
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
};

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within an AuthProvider"
    );
    spy.mockRestore();
  });

  it("returns auth context when inside provider", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createAuthWrapper(mockAuthContext),
    });

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.signInWithOAuth).toBeDefined();
    expect(result.current.signOut).toBeDefined();
  });

  it("returns provided user when authenticated", () => {
    const authedContext: AuthContextType = {
      ...mockAuthContext,
      user: { id: "user-123" } as AuthContextType["user"],
      loading: false,
    };

    const { result } = renderHook(() => useAuth(), {
      wrapper: createAuthWrapper(authedContext),
    });

    expect(result.current.user?.id).toBe("user-123");
  });
});
