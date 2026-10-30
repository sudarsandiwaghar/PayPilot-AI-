import React from 'react'
import { X, Trash2, Plus, Minus, ArrowRight, ShoppingCart, ShieldCheck } from 'lucide-react'
import { useSession } from '../context/useSession'
import { api } from '../api/client'
import { formatCurrency } from '../utils/currency'
import { getProductImageUrl } from '../utils/productImages'

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
    <div className="cart-drawer-backdrop" onClick={() => setIsCartOpen(false)}>
      <div className="cart-drawer-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            padding: '18px 20px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-neutral)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingCart size={18} color="var(--color-secondary)" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
              Shopping Cart
            </h2>
            {cart && (
              <span className="badge badge-purple" style={{ fontSize: '0.72rem' }}>
                v{cart.version}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsCartOpen(false)}
            aria-label="Close shopping cart"
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

        {/* Body Items Scroll */}
        <div className="cart-items-scroll">
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-secondary)' }}>
              <ShoppingCart size={40} color="var(--color-secondary)" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
                Your cart is empty
              </p>
              <p style={{ fontSize: '0.82rem', margin: 0 }}>
                Explore products or ask the Shopping Assistant to add items to your cart.
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="cart-item-row">
                <img
                  src={getProductImageUrl(item.product_image_url, item.product_name)}
                  alt={item.product_name}
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '8px',
                    objectFit: 'contain',
                    backgroundColor: 'var(--color-neutral)',
                    border: '1px solid var(--color-border)',
                    padding: '4px',
                  }}
                />

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {item.product_name}
                    </span>
                    <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {formatCurrency(item.line_total_minor, item.currency)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                      {formatCurrency(item.unit_price_minor, item.currency)} each
                    </span>

                    {/* Quantity Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          border: '1px solid var(--color-border)',
                          borderRadius: '6px',
                          backgroundColor: 'var(--color-neutral)',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          disabled={isCartLoading || item.quantity <= 1}
                          style={{
                            border: 'none',
                            background: 'none',
                            padding: '4px 6px',
                            cursor: 'pointer',
                            color: 'var(--color-text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <Minus size={12} />
                        </button>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, padding: '0 6px', color: 'var(--color-text-primary)' }}>
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          disabled={isCartLoading}
                          style={{
                            border: 'none',
                            background: 'none',
                            padding: '4px 6px',
                            cursor: 'pointer',
                            color: 'var(--color-text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <Plus size={12} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeFromCart(item.id)}
                        disabled={isCartLoading}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-error)',
                          cursor: 'pointer',
                          padding: '2px',
                        }}
                        title="Remove item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Summary & Checkout Action */}
        {items.length > 0 && (
          <div className="cart-summary-footer">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              <span>Subtotal</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{subtotalFormatted}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              <span>Estimated Tax</span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>$0.00</span>
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
              <span>Total</span>
              <span>{subtotalFormatted}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              <ShieldCheck size={12} color="var(--color-secondary)" />
              <span>Real-time price &amp; stock validation &bull; 15-minute hold upon order confirmation</span>
            </div>

            <button
              id="proceed-checkout-btn"
              type="button"
              className="btn btn-primary"
              onClick={handleProceedToPreview}
              style={{ width: '100%', padding: '12px', fontSize: '0.92rem', marginTop: '4px' }}
            >
              <span>Review Order</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
