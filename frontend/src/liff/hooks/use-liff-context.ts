/**
 * LIFF Context Hook
 *
 * Access LIFF session from child components of LiffLayout.
 */

import { useOutletContext } from 'react-router-dom'
import type { LiffSession } from './use-liff-session'

type LiffContextType = {
  session: LiffSession
}

export function useLiffContext() {
  return useOutletContext<LiffContextType>()
}
