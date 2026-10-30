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

interface PaymentModalProps {
  onNavigateToOrders?: () => void
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ onNavigateToOrders }) => {
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
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '16px',
            borderBottom: '1px solid var(--color-border)',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--color-tertiary)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-secondary)',
              }}
            >
              <CreditCard size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                Demo Payment Checkout
              </h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                Order #{activeOrder.order_number || activeOrder.id.substring(0, 8)} &bull; Amount:{' '}
                <strong style={{ color: 'var(--color-text-primary)' }}>{totalFormatted}</strong>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsPaymentOpen(false)}
            aria-label="Close Payment Modal"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
            }}
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
            background: 'var(--color-tertiary)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '20px',
            color: 'var(--color-text-primary)',
            fontSize: '0.82rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={16} color="var(--color-secondary)" />
            <span style={{ fontWeight: 600 }}>Demo payment — no real payment processed</span>
          </div>
          <span
            style={{
              fontSize: '0.7rem',
              background: 'var(--color-secondary)',
              color: 'var(--color-neutral)',
              padding: '3px 8px',
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
            <div className="spin-animation" style={{ display: 'inline-block', marginBottom: '12px' }}>
              <RefreshCw size={28} color="var(--color-secondary)" />
            </div>
            <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              Initializing synthetic payment attempt...
            </div>
          </div>
        ) : isCaptured ? (
          /* Payment Succeeded in Demo Mode & Verified by Backend */
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(21, 128, 61, 0.1)',
                border: '1px solid rgba(21, 128, 61, 0.25)',
                color: 'var(--color-success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <CheckCircle size={36} />
            </div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Demo Payment Captured & Verified!
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', maxWidth: '460px', margin: '0 auto 20px', fontSize: '0.875rem' }}>
              The backend verified the demo transaction, committed your inventory reservations, and marked Order{' '}
              <strong>#{activeOrder.order_number || activeOrder.id.substring(0, 8)}</strong> as{' '}
              <strong style={{ color: 'var(--color-success)' }}>PAID</strong>.
            </p>

            <div
              style={{
                background: 'var(--color-tertiary)',
                border: '1px solid var(--color-border)',
                padding: '14px 16px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                color: 'var(--color-text-primary)',
                marginBottom: '24px',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Demo Transaction ID:</span>
                <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {paymentAttempt?.paypal_order_id}
                </code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Captured Timestamp:</span>
                <span style={{ fontWeight: 600 }}>
                  {paymentAttempt?.captured_at ? new Date(paymentAttempt.captured_at).toLocaleString() : 'Just now'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Stock Status:</span>
                <span style={{ color: 'var(--color-success)', fontWeight: 700 }}>Committed (Guaranteed in Database)</span>
              </div>
              <div
                style={{
                  color: 'var(--color-secondary)',
                  fontSize: '0.75rem',
                  marginTop: '4px',
                  paddingTop: '6px',
                  borderTop: '1px solid var(--color-border)',
                }}
              >
                Note: Demo payment — no real payment processed.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
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
              {onNavigateToOrders && (
                <button
                  id="view-orders-history-btn"
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsPaymentOpen(false)
                    onNavigateToOrders()
                  }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Receipt size={16} />
                  <span>Orders &amp; Spend History</span>
                </button>
              )}
            </div>
          </div>
        ) : isFailed ? (
          /* Payment Failed in Backend */
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(220, 38, 38, 0.1)',
                border: '1px solid rgba(220, 38, 38, 0.25)',
                color: 'var(--color-error)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <AlertOctagon size={36} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              Payment Attempt #{paymentAttempt?.attempt_number} Failed
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', maxWidth: '440px', margin: '0 auto 16px', fontSize: '0.875rem' }}>
              Reason: {paymentAttempt?.failure_reason || 'Declined by payment processor'}
            </p>
            <p
              style={{
                fontSize: '0.82rem',
                color: 'var(--color-warning)',
                background: 'rgba(180, 83, 9, 0.08)',
                border: '1px solid rgba(180, 83, 9, 0.25)',
                borderRadius: '8px',
                padding: '8px 12px',
                marginBottom: '24px',
              }}
            >
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
                background: 'var(--color-tertiary)',
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                  fontSize: '0.85rem',
                }}
              >
                <span style={{ color: 'var(--color-text-secondary)' }}>Attempt Number:</span>
                <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  #{paymentAttempt?.attempt_number}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                  fontSize: '0.85rem',
                }}
              >
                <span style={{ color: 'var(--color-text-secondary)' }}>Demo Order ID:</span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-text-primary)',
                    fontWeight: 700,
                  }}
                >
                  {paymentAttempt?.paypal_order_id || 'Generating...'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Attempt Status:</span>
                <span
                  style={{
                    textTransform: 'uppercase',
                    color: isApproved ? 'var(--color-success)' : 'var(--color-warning)',
                    fontWeight: 700,
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
                    background: 'rgba(21, 128, 61, 0.1)',
                    border: '1px solid rgba(21, 128, 61, 0.25)',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    color: 'var(--color-success)',
                    fontSize: '0.85rem',
                  }}
                >
                  <CheckCircle size={18} />
                  <span style={{ fontWeight: 600 }}>Buyer Approval Simulated! Ready for Backend Capture.</span>
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
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
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
                background: 'var(--color-tertiary)',
                border: '1px dashed var(--color-secondary)',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '10px',
              }}
            >
              <div
                style={{
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  marginBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <ShieldCheck size={16} color="var(--color-secondary)" />
                <span>Backend Capture Verification Gate:</span>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginBottom: '14px', lineHeight: 1.4 }}>
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
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    fontSize: '0.8rem',
                    color: 'var(--color-error)',
                  }}
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
