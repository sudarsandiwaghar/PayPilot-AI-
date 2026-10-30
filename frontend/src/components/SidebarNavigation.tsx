import React from 'react'
import {
  LayoutDashboard,
  Search,
  Scale,
  ShoppingCart,
  Receipt,
  RefreshCw,
  Sparkles,
  Shield,
  Lock,
} from 'lucide-react'
import { useSession } from '../context/useSession'

export type NavigationItem = 'dashboard' | 'agent' | 'catalog' | 'compare' | 'orders'

interface SidebarNavigationProps {
  currentView: NavigationItem
  onSelectView: (view: NavigationItem) => void
}

export const SidebarNavigation: React.FC<SidebarNavigationProps> = ({
  currentView,
  onSelectView,
}) => {
  const {
    session,
    cart,
    setIsCartOpen,
    resetSession,
    isLoadingSession,
    comparisonIds,
  } = useSession()

  const itemCount = cart?.item_count || 0
  const sessionSnippet = session?.session_id
    ? `${session.session_id.substring(0, 8)}...`
    : 'Connecting...'

  return (
    <aside className="desktop-sidebar">
      {/* Brand Header */}
      <a
        href="#home"
        className="sidebar-brand"
        onClick={(e) => {
          e.preventDefault()
          onSelectView('dashboard')
        }}
      >
        <div className="brand-icon-box">
          <Sparkles size={18} color="var(--color-white)" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="brand-text-block">
            <span className="brand-title">PayPilot</span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                backgroundColor: 'rgba(244, 240, 250, 0.25)',
                color: 'var(--color-tertiary)',
                padding: '1px 6px',
                borderRadius: '4px',
              }}
            >
              AI
            </span>
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--sidebar-text)', opacity: 0.85 }}>
            Smart Shopping Gateway
          </span>
        </div>
      </a>

      {/* Navigation List */}
      <nav className="sidebar-nav-list" aria-label="Main Navigation">
        {/* Dashboard */}
        <button
          id="sidebar-nav-dashboard"
          type="button"
          className={`sidebar-nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onSelectView('dashboard')}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </button>

        {/* AI Search Results */}
        <button
          id="sidebar-nav-agent"
          type="button"
          className={`sidebar-nav-btn ${currentView === 'agent' ? 'active' : ''}`}
          onClick={() => onSelectView('agent')}
        >
          <Sparkles size={18} />
          <span>AI Search Results</span>
        </button>

        {/* Product Catalog */}
        <button
          id="sidebar-nav-catalog"
          type="button"
          className={`sidebar-nav-btn ${currentView === 'catalog' ? 'active' : ''}`}
          onClick={() => onSelectView('catalog')}
        >
          <Search size={18} />
          <span>Product Catalog</span>
        </button>

        {/* Product Comparison */}
        <button
          id="sidebar-nav-compare"
          type="button"
          className={`sidebar-nav-btn ${currentView === 'compare' ? 'active' : ''}`}
          onClick={() => onSelectView('compare')}
          title="Compare selected products side-by-side"
        >
          <Scale size={18} />
          <span>Compare</span>
          {comparisonIds.length > 0 && (
            <span className="nav-badge" id="sidebar-compare-badge">
              {comparisonIds.length}
            </span>
          )}
        </button>

        {/* Shopping Cart */}
        <button
          id="sidebar-nav-cart"
          type="button"
          className="sidebar-nav-btn"
          onClick={() => setIsCartOpen(true)}
        >
          <ShoppingCart size={18} />
          <span>Shopping Cart</span>
          {itemCount > 0 && (
            <span className="nav-badge" id="sidebar-cart-badge">
              {itemCount}
            </span>
          )}
        </button>

        {/* Orders & Spend */}
        <button
          id="sidebar-nav-orders"
          type="button"
          className={`sidebar-nav-btn ${currentView === 'orders' ? 'active' : ''}`}
          onClick={() => onSelectView('orders')}
        >
          <Receipt size={18} />
          <span>Orders &amp; Spend</span>
        </button>
      </nav>

      {/* Sidebar Footer: Session Info & Security Notice (Matches Screenshot) */}
      <div className="sidebar-footer">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid var(--sidebar-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-success)',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: '0.76rem',
                color: 'var(--sidebar-text)',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Session {sessionSnippet}
            </span>
          </div>
          <button
            id="sidebar-reset-session-btn"
            type="button"
            onClick={() => resetSession()}
            title={`Session: ${sessionSnippet}. Click to reset.`}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--sidebar-text)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '2px',
              opacity: 0.8,
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
          >
            <RefreshCw size={13} className={isLoadingSession ? 'spin-animation' : ''} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem', color: 'var(--sidebar-text)', opacity: 0.85, paddingLeft: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Shield size={12} color="var(--color-secondary)" />
            <span>HMAC-Signed Previews</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Lock size={12} color="var(--color-secondary)" />
            <span>Zero Client Secrets Stored</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

