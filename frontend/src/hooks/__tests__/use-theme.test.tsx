import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useTheme } from "../use-theme";
import {
  ThemeProviderContext,
  type ThemeProviderState,
} from "@/contexts/theme-context";
import type { ReactNode } from "react";

function createThemeWrapper(value: ThemeProviderState) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ThemeProviderContext.Provider value={value}>
        {children}
      </ThemeProviderContext.Provider>
    );
  };
}

describe("useTheme", () => {
  it("returns default theme state when no provider wraps it", () => {
    // ThemeProviderContext has a default value, so it won't throw
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
    expect(result.current.setTheme).toBeDefined();
  });

  it("returns provided theme value from provider", () => {
    const mockSetTheme = vi.fn();
    const { result } = renderHook(() => useTheme(), {
      wrapper: createThemeWrapper({ theme: "dark", setTheme: mockSetTheme }),
    });

    expect(result.current.theme).toBe("dark");
    expect(result.current.setTheme).toBe(mockSetTheme);
  });

  it("calls setTheme from provider when invoked", () => {
    const mockSetTheme = vi.fn();
    const { result } = renderHook(() => useTheme(), {
      wrapper: createThemeWrapper({ theme: "light", setTheme: mockSetTheme }),
    });

    result.current.setTheme("dark");
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });
});
