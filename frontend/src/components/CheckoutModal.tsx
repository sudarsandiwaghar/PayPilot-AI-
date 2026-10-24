import React, { useState } from 'react'
import {
  X,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowRight,
  CheckCircle2,
  Lock,
} from 'lucide-react'
import { useSession } from '../context/useSession'
import { api, ApiErrorResponse } from '../api/client'
import { formatCurrency } from '../utils/currency'

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
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
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Checkout Preview & Binding</h2>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
                Cart v{checkoutPreview.cart_version} &bull; HMAC Signed Token
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsCheckoutOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Security Binding Notice */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '18px',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Lock size={14} color="var(--accent-emerald)" />
            <span>Token: <code>{tokenPreviewSnippet}</code></span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--accent-amber)' }}>
            <Clock size={14} />
            <span>Expires at {expiresAtDate}</span>
          </div>
        </div>

        {/* Price Change Warning */}
        {priceChanges.length > 0 && (
          <div className="alert alert-warning" style={{ marginBottom: '16px' }}>
            <AlertTriangle size={18} />
            <div>
              <div style={{ fontWeight: 600 }}>Price Adjustments Detected</div>
              <ul style={{ paddingLeft: '16px', marginTop: '4px', fontSize: '0.8rem' }}>
                {priceChanges.map((pc) => (
                  <li key={pc.product_id}>
                    {pc.product_name}: {formatCurrency(pc.old_price_minor, checkoutPreview.currency)} &rarr;{' '}
                    <strong>{formatCurrency(pc.new_price_minor, checkoutPreview.currency)}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Stock Issue Warning */}
        {stockWarnings.length > 0 && (
          <div className="alert alert-error" style={{ marginBottom: '16px' }}>
            <AlertTriangle size={18} />
            <div>
              <div style={{ fontWeight: 600 }}>Inventory Limitations</div>
              <ul style={{ paddingLeft: '16px', marginTop: '4px', fontSize: '0.8rem' }}>
                {stockWarnings.map((sw) => (
                  <li key={sw.product_id}>
                    {sw.product_name}: Available {sw.available_qty}, Requested {sw.requested_qty}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Itemized Bound List */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-muted)' }}>
            Locked Items & Rates:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {items.map((item) => (
              <div
                key={item.product_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'rgba(30, 41, 59, 0.4)',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.product_name}</span>
                  <span style={{ color: 'var(--text-subtle)', marginLeft: '8px' }}>
                    &times; {item.quantity} ({formatCurrency(item.unit_price_minor, item.currency || checkoutPreview.currency)} ea)
                  </span>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                  {formatCurrency(item.line_total_minor, item.currency || checkoutPreview.currency)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Breakdown & Total Price Row */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.4)',
            borderRadius: '8px',
            padding: '12px 14px',
            marginBottom: '20px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
            <span>Subtotal:</span>
            <span>{subtotalFormatted}</span>
          </div>
          {checkoutPreview.tax_minor > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <span>Tax:</span>
              <span>{taxFormatted}</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '8px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              marginTop: '6px',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>Validated Total:</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>Bound by server signature</div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
              {totalFormatted}
            </div>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="alert alert-error" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{error}</span>
            {error.includes('PREVIEW_EXPIRED') && (
              <button
                type="button"
                id="refresh-preview-btn"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap', marginLeft: '12px' }}
                onClick={handleRefreshPreview}
              >
                Refresh Preview
              </button>
            )}
          </div>
        )}

        {/* Mandatory Explicit Shopper Acknowledgment Checkbox */}
        <div
          id="checkout-confirm-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 14px',
            background: hasNotices ? 'rgba(245, 158, 11, 0.1)' : 'rgba(99, 102, 241, 0.08)',
            border: hasNotices ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '0.85rem',
            color: '#fef3c7',
          }}
        >
          <input
            id="checkout-confirm-checkbox"
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            style={{ width: '20px', height: '20px', accentColor: 'var(--accent-primary)', cursor: 'pointer', flexShrink: 0 }}
          />
          <label
            htmlFor="checkout-confirm-checkbox"
            id="checkout-confirm-label"
            style={{ cursor: 'pointer', margin: 0, userSelect: 'none' }}
          >
            <strong>Explicit Shopper Confirmation:</strong> I have reviewed the server-calculated totals, locked rates, and any inventory/price notices, and I authorize confirming this order.
          </label>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsCheckoutOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            id="confirm-checkout-btn"
            type="button"
            className="btn btn-primary"
            onClick={handleConfirmCheckout}
            disabled={isSubmitting || !acknowledged}
          >
            {isSubmitting ? (
              <span>Reserving Stock & Placing Order...</span>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>Confirm Order & Reserve Stock</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
