import { render, screen, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthProvider } from "../AuthContext";
import { useAuth } from "@/hooks/use-auth";
import { AuthContext, type AuthContextType } from "../auth-context-definition";
import { createTestQueryClient } from "@/__tests__/test-utils";

// =============================================================================
// Module mocks
// =============================================================================

const mockUnsubscribe = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: unknown) => mockOnAuthStateChange(cb),
      signInWithOAuth: (opts: unknown) => mockSignInWithOAuth(opts),
      signOut: () => mockSignOut(),
    },
  },
}));

const mockProcessPendingInvitations = vi.fn();
const mockSetAuthToken = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    setAuthToken: (token: string | null) => mockSetAuthToken(token),
    processPendingInvitations: () => mockProcessPendingInvitations(),
  },
}));

// =============================================================================
// Helpers
// =============================================================================

function renderWithAuth(ui: ReactNode, queryClient = createTestQueryClient()) {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

function defaultSession(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "token-abc",
    user: { id: "user-1", email: "user@test.com" },
    ...overrides,
  };
}

// Consumer component to surface context values in DOM for assertions
function AuthStateDisplay() {
  const { user, loading, session } = useAuth();
  return (
    <div>
      <span data-testid="user-id">{user?.id ?? "null"}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="has-session">{session ? "yes" : "no"}</span>
    </div>
  );
}

// =============================================================================
// AuthProvider
// =============================================================================

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: resolved session listener (no active session) + subscription
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });
  });

  // ---------------------------------------------------------------------------
  // Initial loading state
  // ---------------------------------------------------------------------------

  it("starts in loading state before session resolves", async () => {
    // Never resolve so we can observe the loading state
    mockGetSession.mockReturnValue(new Promise(() => {}));

    renderWithAuth(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>
    );

    expect(screen.getByTestId("loading").textContent).toBe("true");
    expect(screen.getByTestId("user-id").textContent).toBe("null");
  });

  // ---------------------------------------------------------------------------
  // Unauthenticated state
  // ---------------------------------------------------------------------------

  it("resolves to unauthenticated state when there is no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    renderWithAuth(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    expect(screen.getByTestId("user-id").textContent).toBe("null");
    expect(screen.getByTestId("has-session").textContent).toBe("no");
  });

  it("sets auth token to null when no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    renderWithAuth(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    expect(mockSetAuthToken).toHaveBeenCalledWith(null);
  });

  // ---------------------------------------------------------------------------
  // Authenticated state
  // ---------------------------------------------------------------------------

  it("populates user and session from getSession result", async () => {
    const session = defaultSession();
    mockGetSession.mockResolvedValue({ data: { session } });

    renderWithAuth(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("user-id").textContent).toBe("user-1")
    );

    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("has-session").textContent).toBe("yes");
  });

  it("calls setAuthToken with the access token when session exists", async () => {
    const session = defaultSession({ access_token: "my-token-123" });
    mockGetSession.mockResolvedValue({ data: { session } });

    renderWithAuth(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    expect(mockSetAuthToken).toHaveBeenCalledWith("my-token-123");
  });

  // ---------------------------------------------------------------------------
  // Auth state change listener
  // ---------------------------------------------------------------------------

  it("updates auth state when SIGNED_IN event fires", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockProcessPendingInvitations.mockResolvedValue({ processed_count: 0 });

    let capturedCallback: ((event: string, session: unknown) => void) | null = null;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    renderWithAuth(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>
    );

    // Wait for initial load
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    expect(screen.getByTestId("user-id").textContent).toBe("null");

    // Simulate sign-in event
    const newSession = defaultSession({ user: { id: "user-99", email: "new@test.com" } });
    await act(async () => {
      capturedCallback!("SIGNED_IN", newSession);
    });

    await waitFor(() =>
      expect(screen.getByTestId("user-id").textContent).toBe("user-99")
    );
    expect(screen.getByTestId("has-session").textContent).toBe("yes");
  });

  it("clears auth state when SIGNED_OUT event fires", async () => {
    const session = defaultSession();
    mockGetSession.mockResolvedValue({ data: { session } });

    let capturedCallback: ((event: string, session: unknown) => void) | null = null;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    renderWithAuth(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("user-id").textContent).toBe("user-1")
    );

    await act(async () => {
      capturedCallback!("SIGNED_OUT", null);
    });

    await waitFor(() =>
      expect(screen.getByTestId("user-id").textContent).toBe("null")
    );
    expect(screen.getByTestId("has-session").textContent).toBe("no");
  });

  // ---------------------------------------------------------------------------
  // Cleanup — unsubscribes on unmount
  // ---------------------------------------------------------------------------

  it("unsubscribes from auth state change on unmount", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });

    const { unmount } = renderWithAuth(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // signInWithOAuth
  // ---------------------------------------------------------------------------

  it("calls supabase signInWithOAuth with the given provider", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithOAuth.mockResolvedValue({ error: null });

    // Render with a consumer that calls signInWithOAuth
    function TriggerSignIn() {
      const { signInWithOAuth } = useAuth();
      return (
        <button onClick={() => signInWithOAuth("google")}>Sign in</button>
      );
    }

    renderWithAuth(
      <AuthProvider>
        <TriggerSignIn />
      </AuthProvider>
    );

    await waitFor(() => screen.getByRole("button", { name: "Sign in" }));

    await act(async () => {
      screen.getByRole("button", { name: "Sign in" }).click();
    });

    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google" })
    );
  });

  it("throws when signInWithOAuth returns an error", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignInWithOAuth.mockResolvedValue({ error: new Error("OAuth failed") });

    let thrownError: unknown;
    function TriggerSignIn() {
      const { signInWithOAuth } = useAuth();
      return (
        <button
          onClick={async () => {
            try {
              await signInWithOAuth("google");
            } catch (e) {
              thrownError = e;
            }
          }}
        >
          Sign in
        </button>
      );
    }

    renderWithAuth(
      <AuthProvider>
        <TriggerSignIn />
      </AuthProvider>
    );

    await waitFor(() => screen.getByRole("button", { name: "Sign in" }));

    await act(async () => {
      screen.getByRole("button", { name: "Sign in" }).click();
    });

    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toBe("OAuth failed");
  });

  // ---------------------------------------------------------------------------
  // signOut
  // ---------------------------------------------------------------------------

  it("calls supabase signOut", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignOut.mockResolvedValue({ error: null });

    function TriggerSignOut() {
      const { signOut } = useAuth();
      return <button onClick={() => signOut()}>Sign out</button>;
    }

    renderWithAuth(
      <AuthProvider>
        <TriggerSignOut />
      </AuthProvider>
    );

    await waitFor(() => screen.getByRole("button", { name: "Sign out" }));

    await act(async () => {
      screen.getByRole("button", { name: "Sign out" }).click();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("throws when signOut returns an error", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockSignOut.mockResolvedValue({ error: new Error("Sign out failed") });

    let thrownError: unknown;
    function TriggerSignOut() {
      const { signOut } = useAuth();
      return (
        <button
          onClick={async () => {
            try {
              await signOut();
            } catch (e) {
              thrownError = e;
            }
          }}
        >
          Sign out
        </button>
      );
    }

    renderWithAuth(
      <AuthProvider>
        <TriggerSignOut />
      </AuthProvider>
    );

    await waitFor(() => screen.getByRole("button", { name: "Sign out" }));

    await act(async () => {
      screen.getByRole("button", { name: "Sign out" }).click();
    });

    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toBe("Sign out failed");
  });

  // ---------------------------------------------------------------------------
  // Pending invitations on SIGNED_IN
  // ---------------------------------------------------------------------------

  it("processes pending invitations when SIGNED_IN fires", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockProcessPendingInvitations.mockResolvedValue({ processed_count: 2 });

    let capturedCallback: ((event: string, session: unknown) => void) | null = null;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    renderWithAuth(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    const newSession = defaultSession();
    await act(async () => {
      capturedCallback!("SIGNED_IN", newSession);
    });

    await waitFor(() => expect(mockProcessPendingInvitations).toHaveBeenCalledTimes(1));
  });

  it("does not throw when processPendingInvitations fails during sign-in", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockProcessPendingInvitations.mockRejectedValue(new Error("network error"));

    let capturedCallback: ((event: string, session: unknown) => void) | null = null;
    mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
      capturedCallback = cb;
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    });

    renderWithAuth(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    const newSession = defaultSession();

    // Should not throw even though processPendingInvitations rejects
    await expect(
      act(async () => {
        capturedCallback!("SIGNED_IN", newSession);
      })
    ).resolves.not.toThrow();

    // User should still be signed in
    await waitFor(() =>
      expect(screen.getByTestId("user-id").textContent).toBe("user-1")
    );
  });

  // ---------------------------------------------------------------------------
  // Context value provided to children
  // ---------------------------------------------------------------------------

  it("provides context value to nested consumers", async () => {
    const session = defaultSession();
    mockGetSession.mockResolvedValue({ data: { session } });

    renderWithAuth(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("false")
    );

    expect(screen.getByTestId("user-id").textContent).toBe("user-1");
    expect(screen.getByTestId("has-session").textContent).toBe("yes");
  });
});

// =============================================================================
// AuthContext direct usage
// =============================================================================

describe("AuthContext", () => {
  it("useAuth throws when used outside of AuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(<AuthStateDisplay />);
    }).toThrow("useAuth must be used within an AuthProvider");

    spy.mockRestore();
  });

  it("accepts externally provided context value", () => {
    const mockValue: AuthContextType = {
      user: { id: "external-user" } as AuthContextType["user"],
      session: null,
      loading: false,
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
    };

    render(
      <AuthContext.Provider value={mockValue}>
        <AuthStateDisplay />
      </AuthContext.Provider>
    );

    expect(screen.getByTestId("user-id").textContent).toBe("external-user");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });
});
