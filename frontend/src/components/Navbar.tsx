import React, { useState } from 'react'
import {
  Sparkles,
  ShoppingBag,
  ShoppingCart,
  Receipt,
  Scale,
  Menu,
  X,
  RefreshCw,
} from 'lucide-react'
import { useSession } from '../context/useSession'

import type { NavigationItem } from './SidebarNavigation'

interface NavbarProps {
  currentView: NavigationItem
  onSelectView: (view: NavigationItem) => void
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onSelectView }) => {
  const {
    session,
    cart,
    setIsCartOpen,
    resetSession,
    isLoadingSession,
    comparisonIds,
  } = useSession()

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const itemCount = cart?.item_count || 0
  const sessionSnippet = session?.session_id
    ? `${session.session_id.substring(0, 8)}...`
    : 'Connecting...'

  return (
    <>
      <header className="mobile-header">
        {/* Left: Hamburger + Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '6px 8px', background: 'rgba(255, 255, 255, 0.1)', color: 'white', borderColor: 'rgba(255, 255, 255, 0.2)' }}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <a
            href="#home"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              textDecoration: 'none',
              color: 'var(--color-white)',
              fontWeight: 800,
            }}
            onClick={(e) => {
              e.preventDefault()
              onSelectView('dashboard')
            }}
          >
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-secondary)',
                color: 'var(--color-white)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={16} color="var(--color-white)" />
            </div>
            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-white)' }}>PayPilot AI</span>
          </a>
        </div>

        {/* Right: Compare & Cart */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {comparisonIds.length > 0 && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => onSelectView('compare')}
              style={{
                padding: '6px 10px',
                fontSize: '0.8rem',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                borderColor: 'rgba(255, 255, 255, 0.2)',
              }}
            >
              <Scale size={15} />
              <span>{comparisonIds.length}</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsCartOpen(true)}
            style={{ padding: '6px 12px' }}
            aria-label="View Shopping Cart"
          >
            <ShoppingCart size={16} />
            {itemCount > 0 && <span>{itemCount}</span>}
          </button>
        </div>
      </header>

      {/* Mobile Nav Drawer dropdown */}
      {isMobileMenuOpen && (
        <div className="mobile-nav-drawer open">
          <button
            type="button"
            className={`sidebar-nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => {
              onSelectView('dashboard')
              setIsMobileMenuOpen(false)
            }}
          >
            <Sparkles size={16} />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-btn ${currentView === 'agent' ? 'active' : ''}`}
            onClick={() => {
              onSelectView('agent')
              setIsMobileMenuOpen(false)
            }}
          >
            <Sparkles size={16} />
            <span>AI Search Results</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-btn ${currentView === 'catalog' ? 'active' : ''}`}
            onClick={() => {
              onSelectView('catalog')
              setIsMobileMenuOpen(false)
            }}
          >
            <ShoppingBag size={16} />
            <span>Product Catalog</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-btn ${currentView === 'compare' ? 'active' : ''}`}
            onClick={() => {
              onSelectView('compare')
              setIsMobileMenuOpen(false)
            }}
          >
            <Scale size={16} />
            <span>Product Comparison</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-btn ${currentView === 'orders' ? 'active' : ''}`}
            onClick={() => {
              onSelectView('orders')
              setIsMobileMenuOpen(false)
            }}
          >
            <Receipt size={16} />
            <span>Orders &amp; Spend</span>
          </button>

          <div
            style={{
              padding: '10px 14px',
              borderTop: '1px solid var(--sidebar-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.8rem',
              color: 'var(--sidebar-text)',
            }}
          >
            <span>{isLoadingSession ? 'Connecting...' : `Session: ${sessionSnippet}`}</span>
            <button
              type="button"
              onClick={() => resetSession()}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--sidebar-text)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <RefreshCw size={12} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
