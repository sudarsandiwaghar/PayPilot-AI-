import React, { useState, useEffect } from 'react'
import {
  X,
  CreditCard,
  ExternalLink,
  CheckCircle,
  AlertOctagon,
  RefreshCw,
  Receipt,
  ShieldCheck,
} from 'lucide-react'
import { useSession } from '../context/useSession'
import { api, ApiErrorResponse } from '../api/client'
import { formatCurrency } from '../utils/currency'

export const PaymentModal: React.FC = () => {
  const {
    token,
    activeOrder,
    setActiveOrder,
    paymentAttempt,
    setPaymentAttempt,
    isPaymentOpen,
    setIsPaymentOpen,
    setIsOrderDetailsOpen,
  } = useSession()

  const [isLoadingAttempt, setIsLoadingAttempt] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize or fetch payment attempt when modal opens
  useEffect(() => {
    let isMounted = true
    const initAttempt = async () => {
      await Promise.resolve()
      if (!isPaymentOpen || !activeOrder?.id || !token || paymentAttempt) return

      try {
        setIsLoadingAttempt(true)
        setError(null)
        const attempt = await api.createPaymentAttempt(activeOrder.id, token)
        if (isMounted) {
          setPaymentAttempt(attempt)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to initiate payment attempt')
        }
      } finally {
        if (isMounted) {
          setIsLoadingAttempt(false)
        }
      }
    }

    initAttempt()
    return () => {
      isMounted = false
    }
  }, [isPaymentOpen, activeOrder?.id, token, paymentAttempt, setPaymentAttempt])

  if (!isPaymentOpen || !activeOrder) return null

  const totalFormatted = formatCurrency(activeOrder.total_minor, activeOrder.currency)

  // Buyer approval simulation handler
  const handleSimulateApproval = async () => {
    const attemptId = paymentAttempt?.attempt_id || paymentAttempt?.id
    if (!activeOrder?.id || !attemptId || !token) return
    try {
      setIsApproving(true)
      setError(null)
      const approved = await api.approvePayment(activeOrder.id, attemptId, token)
      setPaymentAttempt(approved)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(`[${err.code}] ${err.message}`)
      } else {
        setError(err instanceof Error ? err.message : 'Approval simulation failed')
      }
    } finally {
      setIsApproving(false)
    }
  }

  // Capture handler (supports normal success or simulated failure)
  const handleCapture = async (simulateFailure = false) => {
    const attemptId = paymentAttempt?.attempt_id || paymentAttempt?.id
    if (!activeOrder?.id || !attemptId || !token) return
    try {
      setIsCapturing(true)
      setError(null)
      const capturedAttempt = await api.capturePayment(
        activeOrder.id,
        attemptId,
        token,
        simulateFailure
          ? {
              simulate_failure: true,
              failure_reason: 'Simulated payment failure (insufficient buyer funds in demo mode)',
            }
          : undefined
      )
      setPaymentAttempt(capturedAttempt)

      // Refresh order status from backend
      const refreshedOrder = await api.getOrder(activeOrder.id, token)
      setActiveOrder(refreshedOrder)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(`[${err.code}] ${err.message}`)
      } else {
        setError(err instanceof Error ? err.message : 'Capture failed')
      }
    } finally {
      setIsCapturing(false)
    }
  }

  // Create another attempt on retry
  const handleRetryAttempt = async () => {
    if (!activeOrder?.id || !token) return
    try {
      setIsLoadingAttempt(true)
      setError(null)
      const newAttempt = await api.createPaymentAttempt(activeOrder.id, token)
      setPaymentAttempt(newAttempt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start retry attempt')
    } finally {
      setIsLoadingAttempt(false)
    }
  }

  const isCaptured = paymentAttempt?.status === 'captured'
  const isFailed = paymentAttempt?.status === 'capture_failed'
  const isApproved = paymentAttempt?.status === 'approved'

  return (
    <div className="modal-backdrop" onClick={() => setIsPaymentOpen(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(99, 102, 241, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
              }}
            >
              <CreditCard size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Demo Payment Checkout</h2>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
                Order #{activeOrder.order_number || activeOrder.id.substring(0, 8)} &bull; Amount: {totalFormatted}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsPaymentOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Prominent Demo Notice Banner */}
        <div
          id="demo-payment-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '20px',
            color: 'var(--accent-primary)',
            fontSize: '0.82rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={16} />
            <span style={{ fontWeight: 600 }}>Demo payment — no real payment processed</span>
          </div>
          <span
            style={{
              fontSize: '0.7rem',
              background: 'rgba(99, 102, 241, 0.25)',
              padding: '2px 8px',
              borderRadius: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontWeight: 700,
            }}
          >
            Synthetic Demo
          </span>
        </div>

        {/* Loading Spinner */}
        {isLoadingAttempt ? (
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <div className="spin-anim" style={{ display: 'inline-block', marginBottom: '12px' }}>
              <RefreshCw size={28} color="var(--accent-primary)" />
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Initializing synthetic payment attempt...
            </div>
          </div>
        ) : isCaptured ? (
          /* Payment Succeeded in Demo Mode & Verified by Backend */
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--accent-emerald)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <CheckCircle size={36} />
            </div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
              Demo Payment Captured & Verified!
            </h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '460px', margin: '0 auto 20px', fontSize: '0.875rem' }}>
              The backend verified the demo transaction, committed your inventory reservations, and marked Order <strong>#{activeOrder.order_number || activeOrder.id.substring(0, 8)}</strong> as <strong>PAID</strong>.
            </p>

            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                padding: '14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                marginBottom: '24px',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div>Demo Transaction ID: <code style={{ color: 'var(--accent-cyan)' }}>{paymentAttempt?.paypal_order_id}</code></div>
              <div>Captured Timestamp: {paymentAttempt?.captured_at ? new Date(paymentAttempt.captured_at).toLocaleString() : 'Just now'}</div>
              <div>Stock Status: Committed (Guaranteed in Database)</div>
              <div style={{ color: 'var(--accent-primary)', fontSize: '0.75rem', marginTop: '4px' }}>
                Note: Demo payment — no real payment processed.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                id="view-order-details-btn"
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setIsPaymentOpen(false)
                  setIsOrderDetailsOpen(true)
                }}
              >
                <Receipt size={16} />
                <span>View Order Receipt</span>
              </button>
            </div>
          </div>
        ) : isFailed ? (
          /* Payment Failed in Backend */
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(244, 63, 94, 0.15)',
                color: 'var(--accent-rose)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <AlertOctagon size={36} />
            </div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
              Payment Attempt #{paymentAttempt?.attempt_number} Failed
            </h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 16px', fontSize: '0.875rem' }}>
              Reason: {paymentAttempt?.failure_reason || 'Declined by payment processor'}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--accent-amber)', marginBottom: '24px' }}>
              Your inventory hold is still active! You can retry payment on this order without losing your items.
            </p>

            <button
              id="retry-payment-btn"
              type="button"
              className="btn btn-primary"
              onClick={handleRetryAttempt}
              disabled={isLoadingAttempt}
            >
              <RefreshCw size={16} />
              <span>Retry Payment (Attempt #{Number(paymentAttempt?.attempt_number || 1) + 1})</span>
            </button>
          </div>
        ) : (
          /* Active Payment Attempt: Approve & Capture Flow */
          <div>
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Attempt Number:</span>
                <span style={{ fontWeight: 600 }}>#{paymentAttempt?.attempt_number}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Demo Order ID:</span>
                <span style={{ fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>
                  {paymentAttempt?.paypal_order_id || 'Generating...'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Attempt Status:</span>
                <span
                  style={{
                    textTransform: 'uppercase',
                    color: isApproved ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                    fontWeight: 600,
                  }}
                >
                  {isApproved ? 'Approved by Buyer' : paymentAttempt?.status}
                </span>
              </div>
            </div>

            {/* Buyer Approval Simulation */}
            <div style={{ marginBottom: '20px' }}>
              {isApproved ? (
                <div
                  style={{
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: 'var(--accent-emerald)',
                    fontSize: '0.85rem',
                  }}
                >
                  <CheckCircle size={18} />
                  <span>Buyer Approval Simulated! Ready for Backend Capture.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    id="simulate-approval-btn"
                    type="button"
                    className="btn btn-secondary"
                    style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
                    onClick={handleSimulateApproval}
                    disabled={isApproving}
                  >
                    <ExternalLink size={16} />
                    <span>{isApproving ? 'Simulating Approval...' : 'Simulate Buyer Approval'}</span>
                  </button>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textAlign: 'center' }}>
                    Simulates PayPal buyer authorization with synthetic demo credentials.
                  </span>
                </div>
              )}
            </div>

            {/* Error state */}
            {error && (
              <div className="alert alert-error" style={{ marginBottom: '16px' }}>
                <span>{error}</span>
              </div>
            )}

            {/* Backend Capture Controls */}
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.3)',
                border: '1px dashed var(--border-subtle)',
                borderRadius: '8px',
                padding: '14px',
                marginBottom: '10px',
              }}
            >
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} color="var(--accent-emerald)" />
                <span>Backend Capture Verification Gate:</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginBottom: '12px' }}>
                Verifies payment authorization, transitions order to paid, and atomically commits inventory hold.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  id="capture-payment-btn"
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => handleCapture(false)}
                  disabled={isCapturing}
                >
                  {isCapturing ? 'Verifying with Backend...' : 'Verify & Capture Demo Payment'}
                </button>
                <button
                  id="simulate-failure-btn"
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: '100%', justifyContent: 'center', fontSize: '0.78rem', color: 'var(--accent-rose)' }}
                  onClick={() => handleCapture(true)}
                  disabled={isCapturing}
                >
                  Simulate Payment Failure (Test Retry Flow)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
