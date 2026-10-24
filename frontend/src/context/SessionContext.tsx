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
} from './sessionContextDef'

export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<SessionData | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [cart, setCart] = useState<CartData | null>(null)
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(true)
  const [isCartLoading, setIsCartLoading] = useState<boolean>(false)
  const [error, setErrorState] = useState<string | null>(null)

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

  // ── Session Init & Reset (Using sessionStorage) ─────────────────
  const initSession = useCallback(async () => {
    await Promise.resolve()

    // Clean up any legacy localStorage tokens if present
    try {
      localStorage.removeItem(STORAGE_SESSION_ID)
      localStorage.removeItem(STORAGE_ACCESS_TOKEN)
    } catch {
      // Ignore if localStorage unavailable
    }

    const storedId = sessionStorage.getItem(STORAGE_SESSION_ID)
    const storedToken = sessionStorage.getItem(STORAGE_ACCESS_TOKEN)

    if (storedId && storedToken) {
      try {
        const existing = await api.getSession(storedId, storedToken)
        if (existing.status === 'active') {
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
      }
    }

    // Create a new session
    try {
      const created = await api.createSession({ client: 'paypilot-web-frontend' })
      if (created.access_token) {
        sessionStorage.setItem(STORAGE_SESSION_ID, created.session_id)
        sessionStorage.setItem(STORAGE_ACCESS_TOKEN, created.access_token)
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

  const resetSession = useCallback(async () => {
    sessionStorage.removeItem(STORAGE_SESSION_ID)
    sessionStorage.removeItem(STORAGE_ACCESS_TOKEN)
    setSession(null)
    setToken(null)
    setCart(null)
    setCheckoutPreview(null)
    setActiveOrder(null)
    setPaymentAttempt(null)
    await initSession()
  }, [initSession])

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
  const addToCart = async (productId: string, quantity = 1): Promise<boolean> => {
    if (!session?.session_id || !token) {
      setErrorState('No active shopping session.')
      return false
    }
    try {
      setIsCartLoading(true)
      const updatedCart = await api.addItemToCart(session.session_id, token, productId, quantity)
      setCart(updatedCart)
      setIsCartOpen(true)
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
        isCartOpen,
        setIsCartOpen,
        comparisonIds,
        toggleCompareProduct,
        clearComparison,
        checkoutPreview,
        setCheckoutPreview,
        activeOrder,
        setActiveOrder,
        paymentAttempt,
        setPaymentAttempt,
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
