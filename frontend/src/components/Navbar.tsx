import React from 'react'
import { Sparkles, ShoppingBag, ShoppingCart, RefreshCw, Layers } from 'lucide-react'
import { useSession } from '../context/useSession'

interface NavbarProps {
  currentView: 'catalog' | 'agent'
  onSelectView: (view: 'catalog' | 'agent') => void
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onSelectView }) => {
  const {
    session,
    cart,
    setIsCartOpen,
    resetSession,
    isLoadingSession,
    comparisonIds,
    setIsComparisonOpen,
  } = useSession()

  const itemCount = cart?.item_count || 0
  const sessionSnippet = session?.session_id
    ? `${session.session_id.substring(0, 8)}...`
    : 'Connecting...'

  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <a
            href="#home"
            className="nav-brand"
            onClick={(e) => {
              e.preventDefault()
              onSelectView('catalog')
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'var(--gradient-brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 12px rgba(99, 102, 241, 0.5)',
              }}
            >
              <Sparkles size={20} color="white" />
            </div>
            <span>PayPilot</span>
            <span className="brand-badge">AI Shopping</span>
          </a>
        </div>

        {/* View Switcher Tabs */}
        <div className="nav-tabs">
          <button
            type="button"
            className={`nav-tab-btn ${currentView === 'catalog' ? 'active' : ''}`}
            onClick={() => onSelectView('catalog')}
          >
            <ShoppingBag size={16} />
            <span>Product Catalog</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${currentView === 'agent' ? 'active' : ''}`}
            onClick={() => onSelectView('agent')}
          >
            <Sparkles size={16} />
            <span>AI Assistant</span>
          </button>
        </div>

        {/* Right Actions: Session, Compare Tray, Cart */}
        <div className="nav-actions">
          {/* Comparison Tray Indicator */}
          {comparisonIds.length > 0 && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsComparisonOpen(true)}
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
            >
              <Layers size={15} />
              <span>Compare ({comparisonIds.length})</span>
            </button>
          )}

          {/* Secure Session Pill */}
          <div className="session-pill" title={`Session ID: ${session?.session_id || 'None'}`}>
            <span className="session-dot" />
            <span>{isLoadingSession ? 'Starting session...' : `Session ${sessionSnippet}`}</span>
            <button
              type="button"
              onClick={() => resetSession()}
              title="Reset session & generate fresh bearer token"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-subtle)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '2px',
              }}
            >
              <RefreshCw size={13} />
            </button>
          </div>

          {/* Cart Button */}
          <button
            type="button"
            className="btn btn-cart"
            onClick={() => setIsCartOpen(true)}
            aria-label="View Cart"
          >
            <ShoppingCart size={18} />
            {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
          </button>
        </div>
      </div>
    </header>
  )
}
