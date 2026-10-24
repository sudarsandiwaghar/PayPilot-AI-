import { useContext } from 'react'
import { SessionContext } from './sessionContextDef'
import type { SessionContextType } from './sessionContextDef'

export const useSession = (): SessionContextType => {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return context
}
