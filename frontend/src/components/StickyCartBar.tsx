import React from 'react'
import { ShoppingCart, ArrowRight, Check } from 'lucide-react'
import { useSession } from '../context/useSession'
import { formatCurrency } from '../utils/currency'

export const StickyCartBar: React.FC = () => {
  const { cart, isLoadingSession, setIsCartOpen, cartFeedback } = useSession()

  // Clean state: avoid showing false counts during initial session load
  if (isLoadingSession) {
    return null
  }

  const totalUnits = cart?.item_count ?? 0

  // Hide if no items in cart and no active addition feedback
  if (totalUnits === 0 && !cartFeedback) {
    return null
  }

  const formattedSubtotal = cart ? formatCurrency(cart.subtotal_minor, cart.currency) : '$0.00'

  return (
    <aside
      className="sticky-cart-bar"
      role="region"
      aria-label="Shopping Cart Summary"
      onClick={() => setIsCartOpen(true)}
    >
      <div className="sticky-cart-bar-left">
        <div className="sticky-cart-icon-wrapper">
          <ShoppingCart size={18} color="var(--color-white)" />
          <span className="sticky-cart-unit-badge" aria-label={`${totalUnits} units in cart`}>
            {totalUnits}
          </span>
        </div>

        <div className="sticky-cart-text-group">
          <div className="sticky-cart-main-text">
            <strong>{totalUnits}</strong> {totalUnits === 1 ? 'unit' : 'units'} in cart
          </div>
          <div className="sticky-cart-subtotal-text">
            Subtotal: <strong>{formattedSubtotal}</strong>
          </div>
        </div>
      </div>

      {cartFeedback ? (
        <div className="sticky-cart-feedback-pill" role="status" aria-live="polite">
          <Check size={14} />
          <span>{cartFeedback}</span>
        </div>
      ) : null}

      <div className="sticky-cart-bar-right">
        <button
          type="button"
          className="btn btn-secondary sticky-cart-view-btn"
          onClick={(e) => {
            e.stopPropagation()
            setIsCartOpen(true)
          }}
          aria-label="Open Shopping Cart Drawer"
        >
          <span>View Cart</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </aside>
  )
}
