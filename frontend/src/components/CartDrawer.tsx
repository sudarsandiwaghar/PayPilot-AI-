import React from 'react'
import { X, Trash2, Plus, Minus, ArrowRight, ShoppingBag, ShieldCheck } from 'lucide-react'
import { useSession } from '../context/useSession'
import { api } from '../api/client'
import { formatCurrency } from '../utils/currency'

export const CartDrawer: React.FC = () => {
  const {
    session,
    token,
    cart,
    isCartOpen,
    setIsCartOpen,
    updateQuantity,
    removeFromCart,
    isCartLoading,
    setCheckoutPreview,
    setIsCheckoutOpen,
    setError,
  } = useSession()

  if (!isCartOpen) return null

  const items = cart?.items || []
  const subtotalFormatted = cart ? formatCurrency(cart.subtotal_minor, cart.currency) : '$0.00'

  const handleProceedToPreview = async () => {
    if (!session?.session_id || !token || !cart) return
    try {
      const preview = await api.createCheckoutPreview(session.session_id, token)
      setCheckoutPreview(preview)
      setIsCartOpen(false)
      setIsCheckoutOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate checkout preview')
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => setIsCartOpen(false)}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingBag size={20} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Your Shopping Cart</h2>
            {cart && (
              <span className="cart-badge" style={{ position: 'static' }}>
                v{cart.version}
              </span>
            )}
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={() => setIsCartOpen(false)}
            aria-label="Close cart"
          >
            <X size={20} />
          </button>
        </div>

        {/* Items List */}
        <div className="drawer-body">
          {items.length === 0 ? (
            <div className="empty-cart-state">
              <ShoppingBag size={48} className="empty-cart-icon" />
              <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                Your cart is empty
              </p>
              <p style={{ fontSize: '0.85rem' }}>
                Browse our catalog or query the AI assistant to add items.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="cart-item-row">
                <img
                  src={
                    item.product_image_url ||
                    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=200'
                  }
                  alt={item.product_name}
                  className="cart-item-img"
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: 'var(--text-main)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={item.product_name}
                  >
                    {item.product_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 8px' }}>
                    {formatCurrency(item.unit_price_minor, item.currency || cart?.currency)} each
                  </div>

                  {/* Quantity Control */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="qty-control">
                      <button
                        type="button"
                        className="qty-btn"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        disabled={isCartLoading}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={12} />
                      </button>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, minWidth: '18px', textAlign: 'center' }}>
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        className="qty-btn"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={isCartLoading}
                        aria-label="Increase quantity"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                      {formatCurrency(item.line_total_minor, item.currency || cart?.currency)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => removeFromCart(item.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-subtle)',
                    cursor: 'pointer',
                    padding: '6px',
                  }}
                  title="Remove item"
                  disabled={isCartLoading}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="drawer-footer">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Authoritative Subtotal:</span>
              <span style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-main)' }}>
                {subtotalFormatted}
              </span>
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-subtle)',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <ShieldCheck size={13} color="var(--accent-emerald)" />
              <span>Calculated exclusively on server &bull; Zero client-side math</span>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
              onClick={handleProceedToPreview}
              disabled={isCartLoading}
            >
              <span>Review Checkout Preview</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
