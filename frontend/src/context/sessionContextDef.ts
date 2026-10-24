import { createContext } from 'react'
import type {
  CartData,
  CheckoutPreview,
  OrderData,
  PaymentAttemptData,
  SessionData,
} from '../api/types'

export interface SessionContextType {
  session: SessionData | null
  token: string | null
  cart: CartData | null
  isLoadingSession: boolean
  isCartLoading: boolean
  error: string | null
  clearError: () => void
  setError: (msg: string | null) => void

  // Session Actions
  initSession: () => Promise<void>
  resetSession: () => Promise<void>

  // Cart Actions (Server Authoritative)
  refreshCart: () => Promise<void>
  addToCart: (productId: string, quantity?: number) => Promise<boolean>
  updateQuantity: (itemId: string, quantity: number) => Promise<boolean>
  removeFromCart: (itemId: string) => Promise<boolean>

  // Flow State & Modals
  isCartOpen: boolean
  setIsCartOpen: (open: boolean) => void
  comparisonIds: string[]
  toggleCompareProduct: (productId: string) => void
  clearComparison: () => void

  // Checkout & Payment State
  checkoutPreview: CheckoutPreview | null
  setCheckoutPreview: (preview: CheckoutPreview | null) => void
  activeOrder: OrderData | null
  setActiveOrder: (order: OrderData | null) => void
  paymentAttempt: PaymentAttemptData | null
  setPaymentAttempt: (attempt: PaymentAttemptData | null) => void

  // Modals
  isCheckoutOpen: boolean
  setIsCheckoutOpen: (open: boolean) => void
  isPaymentOpen: boolean
  setIsPaymentOpen: (open: boolean) => void
  isOrderDetailsOpen: boolean
  setIsOrderDetailsOpen: (open: boolean) => void
  isComparisonOpen: boolean
  setIsComparisonOpen: (open: boolean) => void
}

export const STORAGE_SESSION_ID = 'paypilot_session_id'
export const STORAGE_ACCESS_TOKEN = 'paypilot_access_token'

export const SessionContext = createContext<SessionContextType | undefined>(undefined)
