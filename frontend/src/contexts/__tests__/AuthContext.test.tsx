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
const mockOnAuthStateChange = vi.fn();
const mockSignInWithOAuth = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
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

/**
 * Mock onAuthStateChange to immediately invoke callback with INITIAL_SESSION.
 * Returns the captured callback for later event simulation.
 */
function mockAuthStateWithSession(session: unknown) {
  let capturedCallback: ((event: string, session: unknown) => void) | null =
    null;
  mockOnAuthStateChange.mockImplementation(
    (cb: (event: string, session: unknown) => void) => {
      capturedCallback = cb;
      // Simulate INITIAL_SESSION — fires synchronously at registration
      cb("INITIAL_SESSION", session);
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
    }
  );
  return () => capturedCallback!;
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
    mockAuthStateWithSession(null);
  });

  // ---------------------------------------------------------------------------
  // Initial loading state
  // ---------------------------------------------------------------------------

  it("starts in loading state before onAuthStateChange fires", async () => {
    // Override: never invoke callback so we can observe loading state
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    });

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

  it("populates user and session from INITIAL_SESSION", async () => {
    const session = defaultSession();
    mockAuthStateWithSession(session);

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
    mockAuthStateWithSession(session);

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
    mockProcessPendingInvitations.mockResolvedValue({ processed_count: 0 });
    const getCallback = mockAuthStateWithSession(null);

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
    const newSession = defaultSession({
      user: { id: "user-99", email: "new@test.com" },
    });
    await act(async () => {
      getCallback()("SIGNED_IN", newSession);
    });

    await waitFor(() =>
      expect(screen.getByTestId("user-id").textContent).toBe("user-99")
    );
    expect(screen.getByTestId("has-session").textContent).toBe("yes");
  });

  it("clears auth state when SIGNED_OUT event fires", async () => {
    const session = defaultSession();
    const getCallback = mockAuthStateWithSession(session);

    renderWithAuth(
      <AuthProvider>
        <AuthStateDisplay />
      </AuthProvider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("user-id").textContent).toBe("user-1")
    );

    await act(async () => {
      getCallback()("SIGNED_OUT", null);
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
    mockSignInWithOAuth.mockResolvedValue({ error: null });

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
    mockSignInWithOAuth.mockResolvedValue({
      error: new Error("OAuth failed"),
    });

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
  // Pending invitations on SIGNED_IN (deferred via setTimeout)
  // ---------------------------------------------------------------------------

  it("processes pending invitations when SIGNED_IN fires", async () => {
    mockProcessPendingInvitations.mockResolvedValue({ processed_count: 2 });
    const getCallback = mockAuthStateWithSession(null);

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
      getCallback()("SIGNED_IN", newSession);
    });

    // processPendingInvitations is deferred via setTimeout — wait for it
    await waitFor(() =>
      expect(mockProcessPendingInvitations).toHaveBeenCalledTimes(1)
    );
  });

  it("does not throw when processPendingInvitations fails during sign-in", async () => {
    mockProcessPendingInvitations.mockRejectedValue(new Error("network error"));
    const getCallback = mockAuthStateWithSession(null);

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
        getCallback()("SIGNED_IN", newSession);
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
    mockAuthStateWithSession(session);

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
