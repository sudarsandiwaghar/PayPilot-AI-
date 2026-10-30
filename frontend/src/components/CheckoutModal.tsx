import React, { useState } from 'react'
import {
  X,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowRight,
  Lock,
} from 'lucide-react'
import { useSession } from '../context/useSession'
import { api, ApiErrorResponse } from '../api/client'
import { formatCurrency } from '../utils/currency'
import { getProductImageUrl } from '../utils/productImages'

export const CheckoutModal: React.FC = () => {
  const {
    session,
    token,
    checkoutPreview,
    setCheckoutPreview,
    isCheckoutOpen,
    setIsCheckoutOpen,
    setIsPaymentOpen,
    setActiveOrder,
    refreshCart,
  } = useSession()

  const [acknowledged, setAcknowledged] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isCheckoutOpen || !checkoutPreview) return null

  const items = checkoutPreview.order_summary || checkoutPreview.items || []
  const priceChanges = checkoutPreview.price_changes || []
  const stockWarnings = checkoutPreview.stock_warnings || checkoutPreview.stock_issues || []

  const totalFormatted = formatCurrency(checkoutPreview.total_minor, checkoutPreview.currency)
  const subtotalFormatted = formatCurrency(checkoutPreview.subtotal_minor, checkoutPreview.currency)
  const taxFormatted = formatCurrency(checkoutPreview.tax_minor, checkoutPreview.currency)
  const expiresAtDate = new Date(checkoutPreview.expires_at).toLocaleTimeString()
  const tokenPreviewSnippet = `${checkoutPreview.preview_token.substring(0, 16)}...${checkoutPreview.preview_token.slice(-10)}`

  const hasNotices = priceChanges.length > 0 || stockWarnings.length > 0

  const handleConfirmCheckout = async () => {
    if (!session?.session_id || !token) return

    if (!acknowledged) {
      setError('You must explicitly confirm and acknowledge this order preview before proceeding.')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)
      const order = await api.confirmCheckout(
        session.session_id,
        token,
        checkoutPreview.preview_token
      )
      setActiveOrder(order)
      setIsCheckoutOpen(false)
      setIsPaymentOpen(true)
      await refreshCart()
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        setError(`[${err.code}] ${err.message}`)
      } else {
        setError(err instanceof Error ? err.message : 'Checkout confirmation failed')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRefreshPreview = async () => {
    if (!session?.session_id || !token) return
    try {
      setIsSubmitting(true)
      setError(null)
      const freshPreview = await api.createCheckoutPreview(session.session_id, token)
      setCheckoutPreview(freshPreview)
      setAcknowledged(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh preview')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => setIsCheckoutOpen(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-tertiary)',
                color: 'var(--color-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
                Review Order & Reserve Stock
              </h2>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                HMAC-Signed Review Gate &bull; 10-Minute Quote Validity &bull; 15-Minute Reservation on Confirmation
              </div>
            </div>
          </div>
          <button
            id="checkout-modal-close-btn"
            type="button"
            onClick={() => setIsCheckoutOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Cryptographic Security Pill */}
        <div
          className="purple-surface-panel"
          style={{
            padding: '12px 14px',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            fontSize: '0.8rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={13} color="var(--color-secondary)" />
            <span style={{ color: 'var(--color-text-secondary)' }}>Signed Token:</span>
            <code style={{ color: 'var(--color-text-primary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {tokenPreviewSnippet}
            </code>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-secondary)' }}>
            <Clock size={13} />
            <span>Expires: {expiresAtDate}</span>
          </div>
        </div>

        {/* Warnings / Notices */}
        {hasNotices && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {priceChanges.map((change, i) => (
              <div key={i} className="alert alert-warning">
                <AlertTriangle size={16} />
                <span>
                  Price updated for <strong>{change.product_name}</strong>: was{' '}
                  {formatCurrency(change.old_price_minor, checkoutPreview.currency)}, now{' '}
                  {formatCurrency(change.new_price_minor, checkoutPreview.currency)}.
                </span>
              </div>
            ))}
            {stockWarnings.map((warn, i) => (
              <div key={i} className="alert alert-error">
                <AlertTriangle size={16} />
                <span>
                  Limited stock for <strong>{warn.product_name}</strong>: requested {warn.requested_qty}, available {warn.available_qty}.
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Items Summary */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.78rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              paddingBottom: '8px',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <span>Item</span>
            <span>Total</span>
          </div>

          {items.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: '1px solid var(--color-border)',
                fontSize: '0.88rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <img
                  src={getProductImageUrl(item.product_image_url, item.product_name)}
                  alt={item.product_name}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '6px',
                    objectFit: 'contain',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-neutral)',
                    padding: '2px',
                  }}
                />
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.product_name}</span>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', marginLeft: '6px' }}>
                    &times; {item.quantity}
                  </span>
                </div>
              </div>
              <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {formatCurrency(item.line_total_minor, item.currency)}
              </span>
            </div>
          ))}
        </div>

        {/* Financial Summary */}
        <div
          className="purple-surface-panel"
          style={{
            padding: '14px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
            <span>Subtotal</span>
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{subtotalFormatted}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
            <span>Taxes & Fees</span>
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{taxFormatted}</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: '1px solid var(--color-border)',
              fontSize: '1.15rem',
              fontWeight: 800,
              color: 'var(--color-text-primary)',
            }}
          >
            <span>Total Due</span>
            <span>{totalFormatted}</span>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '16px' }}>
            <span>{error}</span>
          </div>
        )}

        {/* Confirmation Checkbox */}
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              color: 'var(--color-text-primary)',
              lineHeight: 1.4,
            }}
          >
            <input
              id="confirm-checkout-checkbox"
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => {
                setAcknowledged(e.target.checked)
                setError(null)
              }}
              style={{
                accentColor: 'var(--color-secondary)',
                width: '18px',
                height: '18px',
                marginTop: '2px',
                flexShrink: 0,
              }}
            />
            <span>
              I have reviewed the items and prices and authorize PayPilot to confirm this order and place a 15-minute inventory reservation hold (Synthetic Demo Flow).
            </span>
          </label>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          {hasNotices && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleRefreshPreview}
              disabled={isSubmitting}
            >
              Re-price Cart
            </button>
          )}

          <button
            id="confirm-checkout-btn"
            type="button"
            className="btn btn-primary"
            onClick={handleConfirmCheckout}
            disabled={!acknowledged || isSubmitting}
            style={{ padding: '10px 20px' }}
          >
            <span>{isSubmitting ? 'Placing Order...' : 'Confirm & Place Order'}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
