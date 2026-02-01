/**
 * LIFF Context Hook
 *
 * Access LIFF session from child components of LiffLayout.
 * Returns LiffSessionWithGroup since LiffLayout validates lineGroupId before rendering.
 */

import { useOutletContext } from "react-router-dom";
import type { LiffContextType } from "../components/LiffLayout";

export function useLiffContext() {
  return useOutletContext<LiffContextType>();
}
