/**
 * Session, Cart, and App State Provider.
 *
 * Persists anonymous session bearer token in sessionStorage (per browser tab)
 * to avoid long-term disk persistence while ensuring session recovery still works
 * after a page refresh in the same tab.
 * Tracks cart items and relies exclusively on backend server-calculated totals.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { api, ApiErrorResponse } from '../api/client'
import type {
  CartData,
  CheckoutPreview,
  OrderData,
  PaymentAttemptData,
  SessionData,
} from '../api/types'
import {
  SessionContext,
  STORAGE_SESSION_ID,
  STORAGE_ACCESS_TOKEN,
  STORAGE_ACTIVE_ORDER_ID,
  STORAGE_PAYPAL_ORDER_ID,
} from './sessionContextDef'

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<SessionData | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [cart, setCart] = useState<CartData | null>(null)
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(true)
  const [isCartLoading, setIsCartLoading] = useState<boolean>(false)
  const [error, setErrorState] = useState<string | null>(null)
  const [cartFeedback, setCartFeedback] = useState<string | null>(null)
  const feedbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCartFeedback = useCallback(() => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current)
      feedbackTimerRef.current = null
    }
    setCartFeedback(null)
  }, [])

  // Modals & Navigation
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [isComparisonOpen, setIsComparisonOpen] = useState(false)
  const [checkoutPreview, setCheckoutPreview] = useState<CheckoutPreview | null>(null)
  const [activeOrder, setActiveOrder] = useState<OrderData | null>(null)
  const [paymentAttempt, setPaymentAttempt] = useState<PaymentAttemptData | null>(null)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isPaymentOpen, setIsPaymentOpen] = useState(false)
  const [isOrderDetailsOpen, setIsOrderDetailsOpen] = useState(false)

  const clearError = () => setErrorState(null)
  const setError = (msg: string | null) => setErrorState(msg)

  // ── Session Init & Reset (Using sessionStorage with tab-recovery support) ───
  const initSession = useCallback(async () => {
    await Promise.resolve()

    const storedId = sessionStorage.getItem(STORAGE_SESSION_ID) || localStorage.getItem(STORAGE_SESSION_ID)
    const storedToken = sessionStorage.getItem(STORAGE_ACCESS_TOKEN) || localStorage.getItem(STORAGE_ACCESS_TOKEN)

    if (storedId && storedToken) {
      try {
        const existing = await api.getSession(storedId, storedToken)
        if (existing.status === 'active') {
          sessionStorage.setItem(STORAGE_SESSION_ID, storedId)
          sessionStorage.setItem(STORAGE_ACCESS_TOKEN, storedToken)
          try {
            localStorage.setItem(STORAGE_SESSION_ID, storedId)
            localStorage.setItem(STORAGE_ACCESS_TOKEN, storedToken)
          } catch {}
          setSession(existing)
          setToken(storedToken)
          // Load cart for this session
          const cartData = await api.getCart(existing.session_id, storedToken)
          setCart(cartData)
          setIsLoadingSession(false)
          return
        }
      } catch {
        // Stored session invalid, fallback to creating fresh
        sessionStorage.removeItem(STORAGE_SESSION_ID)
        sessionStorage.removeItem(STORAGE_ACCESS_TOKEN)
        try {
          localStorage.removeItem(STORAGE_SESSION_ID)
          localStorage.removeItem(STORAGE_ACCESS_TOKEN)
        } catch {}
      }
    }

    // Create a new session
    try {
      const created = await api.createSession({ client: 'paypilot-web-frontend' })
      if (created.access_token) {
        sessionStorage.setItem(STORAGE_SESSION_ID, created.session_id)
        sessionStorage.setItem(STORAGE_ACCESS_TOKEN, created.access_token)
        try {
          localStorage.setItem(STORAGE_SESSION_ID, created.session_id)
          localStorage.setItem(STORAGE_ACCESS_TOKEN, created.access_token)
        } catch {}
        setSession({
          session_id: created.session_id,
          status: created.status,
          access_token: created.access_token,
          created_at: created.created_at,
        })
        setToken(created.access_token)
        const cartData = await api.getCart(created.session_id, created.access_token)
        setCart(cartData)
      }
    } catch (err) {
      setErrorState(err instanceof Error ? err.message : 'Failed to initialize session')
    } finally {
      setIsLoadingSession(false)
    }
  }, [])

  const clearCheckoutRecoveryData = useCallback(() => {
    sessionStorage.removeItem(STORAGE_ACTIVE_ORDER_ID)
    sessionStorage.removeItem(STORAGE_PAYPAL_ORDER_ID)
    try {
      localStorage.removeItem(STORAGE_ACTIVE_ORDER_ID)
      localStorage.removeItem(STORAGE_PAYPAL_ORDER_ID)
    } catch {}
  }, [])

  const handleSetActiveOrder = useCallback((order: OrderData | null) => {
    setActiveOrder(order)
    if (order?.id) {
      sessionStorage.setItem(STORAGE_ACTIVE_ORDER_ID, order.id)
      try {
        localStorage.setItem(STORAGE_ACTIVE_ORDER_ID, order.id)
      } catch {}
    } else {
      sessionStorage.removeItem(STORAGE_ACTIVE_ORDER_ID)
      try {
        localStorage.removeItem(STORAGE_ACTIVE_ORDER_ID)
      } catch {}
    }
  }, [])

  const handleSetPaymentAttempt = useCallback((attempt: PaymentAttemptData | null) => {
    setPaymentAttempt(attempt)
    if (attempt?.paypal_order_id) {
      sessionStorage.setItem(STORAGE_PAYPAL_ORDER_ID, attempt.paypal_order_id)
      try {
        localStorage.setItem(STORAGE_PAYPAL_ORDER_ID, attempt.paypal_order_id)
      } catch {}
    } else if (!attempt) {
      sessionStorage.removeItem(STORAGE_PAYPAL_ORDER_ID)
      try {
        localStorage.removeItem(STORAGE_PAYPAL_ORDER_ID)
      } catch {}
    }
  }, [])

  const restoreCheckoutOrder = useCallback(
    async (
      paypalToken?: string,
      recoveryToken?: string,
      payerId?: string
    ): Promise<{ order: OrderData; attempt: PaymentAttemptData } | null> => {
      let storedOrderId =
        sessionStorage.getItem(STORAGE_ACTIVE_ORDER_ID) ||
        localStorage.getItem(STORAGE_ACTIVE_ORDER_ID)
      let currentToken =
        token ||
        sessionStorage.getItem(STORAGE_ACCESS_TOKEN) ||
        localStorage.getItem(STORAGE_ACCESS_TOKEN)

      // Fallback 1: If browser storage is empty (e.g. Incognito or fresh window), but recoveryToken & paypalToken are present:
      if ((!storedOrderId || !currentToken) && recoveryToken && paypalToken) {
        try {
          const resolved = await api.resolvePayPalReturn({
            recovery_token: recoveryToken,
            paypal_order_id: paypalToken,
            payer_id: payerId || undefined,
          })

          if (resolved?.access_token && resolved?.order) {
            sessionStorage.setItem(STORAGE_SESSION_ID, resolved.session_id)
            sessionStorage.setItem(STORAGE_ACCESS_TOKEN, resolved.access_token)
            try {
              localStorage.setItem(STORAGE_SESSION_ID, resolved.session_id)
              localStorage.setItem(STORAGE_ACCESS_TOKEN, resolved.access_token)
            } catch {}

            setSession({
              session_id: resolved.session_id,
              status: 'active',
              access_token: resolved.access_token,
              created_at: new Date().toISOString(),
            })
            setToken(resolved.access_token)
            handleSetActiveOrder(resolved.order)
            handleSetPaymentAttempt(resolved.attempt)
            setIsPaymentOpen(true)
            return { order: resolved.order, attempt: resolved.attempt }
          }
        } catch (resolveErr) {
          console.error('Failed to resolve PayPal return with recovery token:', resolveErr)
          throw resolveErr
        }
      }

      if (!storedOrderId || !currentToken) {
        return null
      }

      try {
        const order = await api.getOrder(storedOrderId, currentToken)
        const attempts = await api.listPaymentAttempts(storedOrderId, currentToken)
        let matchedAttempt: PaymentAttemptData | null = null

        if (paypalToken) {
          matchedAttempt = attempts.find((a) => a.paypal_order_id === paypalToken) || null
          if (!matchedAttempt && attempts.length > 0) {
            const latest = attempts[attempts.length - 1]
            if (latest.paypal_order_id === paypalToken) {
              matchedAttempt = latest
            }
          }
        } else {
          matchedAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null
        }

        if (!matchedAttempt) {
          if (paypalToken) {
            throw new Error(
              `Security validation failed: returned PayPal token ${paypalToken} does not match any payment attempt for order ${storedOrderId}.`
            )
          }
          return null
        }

        handleSetActiveOrder(order)
        handleSetPaymentAttempt(matchedAttempt)
        setIsPaymentOpen(true)
        return { order, attempt: matchedAttempt }
      } catch (err) {
        console.error('Failed to restore checkout order:', err)
        throw err
      }
    },
    [token, handleSetActiveOrder, handleSetPaymentAttempt]
  )

  const resetSession = useCallback(async () => {
    sessionStorage.removeItem(STORAGE_SESSION_ID)
    sessionStorage.removeItem(STORAGE_ACCESS_TOKEN)
    try {
      localStorage.removeItem(STORAGE_SESSION_ID)
      localStorage.removeItem(STORAGE_ACCESS_TOKEN)
    } catch {}
    clearCheckoutRecoveryData()
    setSession(null)
    setToken(null)
    setCart(null)
    clearCartFeedback()
    setCheckoutPreview(null)
    setActiveOrder(null)
    setPaymentAttempt(null)
    await initSession()
  }, [initSession, clearCartFeedback, clearCheckoutRecoveryData])

  // ── Cart Refresh ───────────────────────────────────────────────
  const refreshCart = useCallback(async () => {
    if (!session?.session_id || !token) return
    try {
      setIsCartLoading(true)
      const data = await api.getCart(session.session_id, token)
      setCart(data)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        // If session expired or inactive, re-init
        if (err.code === 'SESSION_INACTIVE' || err.code === 'SESSION_NOT_FOUND') {
          await resetSession()
        }
      }
    } finally {
      setIsCartLoading(false)
    }
  }, [session, token, resetSession])

  useEffect(() => {
    let ignore = false
    const load = async () => {
      await Promise.resolve()
      if (!ignore) {
        await initSession()
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [initSession])

  // ── Cart Operations ────────────────────────────────────────────
  const addToCart = async (productId: string, quantity = 1, openDrawer = false): Promise<boolean> => {
    if (!session?.session_id || !token) {
      setErrorState('No active shopping session.')
      return false
    }
    try {
      setIsCartLoading(true)
      const updatedCart = await api.addItemToCart(session.session_id, token, productId, quantity)
      setCart(updatedCart)
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current)
      }
      setCartFeedback(`Added to cart +${quantity}`)
      feedbackTimerRef.current = setTimeout(() => {
        setCartFeedback(null)
      }, 2800)

      if (openDrawer) {
        setIsCartOpen(true)
      }
      return true
    } catch (err) {
      setErrorState(err instanceof Error ? err.message : 'Failed to add item to cart')
      return false
    } finally {
      setIsCartLoading(false)
    }
  }

  const updateQuantity = async (itemId: string, quantity: number): Promise<boolean> => {
    if (!session?.session_id || !token) return false
    try {
      setIsCartLoading(true)
      const updatedCart =
        quantity <= 0
          ? await api.removeCartItem(session.session_id, token, itemId)
          : await api.updateCartItem(session.session_id, token, itemId, quantity)
      setCart(updatedCart)
      return true
    } catch (err) {
      setErrorState(err instanceof Error ? err.message : 'Failed to update item quantity')
      return false
    } finally {
      setIsCartLoading(false)
    }
  }

  const removeFromCart = async (itemId: string): Promise<boolean> => {
    if (!session?.session_id || !token) return false
    try {
      setIsCartLoading(true)
      const updatedCart = await api.removeCartItem(session.session_id, token, itemId)
      setCart(updatedCart)
      return true
    } catch (err) {
      setErrorState(err instanceof Error ? err.message : 'Failed to remove item from cart')
      return false
    } finally {
      setIsCartLoading(false)
    }
  }

  // ── Comparison Tray ────────────────────────────────────────────
  const toggleCompareProduct = (productId: string) => {
    setComparisonIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId)
      }
      if (prev.length >= 4) {
        setErrorState('You can compare up to 4 products at a time.')
        return prev
      }
      return [...prev, productId]
    })
  }

  const clearComparison = () => {
    setComparisonIds([])
    setIsComparisonOpen(false)
  }

  return (
    <SessionContext.Provider
      value={{
        session,
        token,
        cart,
        isLoadingSession,
        isCartLoading,
        error,
        clearError,
        setError,
        initSession,
        resetSession,
        refreshCart,
        addToCart,
        updateQuantity,
        removeFromCart,
        cartFeedback,
        clearCartFeedback,
        isCartOpen,
        setIsCartOpen,
        comparisonIds,
        toggleCompareProduct,
        clearComparison,
        checkoutPreview,
        setCheckoutPreview,
        activeOrder,
        setActiveOrder: handleSetActiveOrder,
        paymentAttempt,
        setPaymentAttempt: handleSetPaymentAttempt,
        restoreCheckoutOrder,
        clearCheckoutRecoveryData,
        isCheckoutOpen,
        setIsCheckoutOpen,
        isPaymentOpen,
        setIsPaymentOpen,
        isOrderDetailsOpen,
        setIsOrderDetailsOpen,
        isComparisonOpen,
        setIsComparisonOpen,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}
