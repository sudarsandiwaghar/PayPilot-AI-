import { useState, useEffect, useCallback } from 'react'
import { SidebarNavigation, type NavigationItem } from './components/SidebarNavigation'
import { Navbar } from './components/Navbar'
import { DashboardView } from './components/DashboardView'
import { CatalogView } from './components/CatalogView'
import { ProductComparisonView } from './components/ProductComparisonView'
import { AgentChatView } from './components/AgentChatView'
import { OrdersHistoryView } from './components/OrdersHistoryView'
import { CartDrawer } from './components/CartDrawer'
import { CheckoutModal } from './components/CheckoutModal'
import { PaymentModal } from './components/PaymentModal'
import { OrderDetailsModal } from './components/OrderDetailsModal'
import { ComparisonModal } from './components/ComparisonModal'
import { useSession } from './context/useSession'
import { AlertCircle, X, Shield, Lock, Server } from 'lucide-react'

export function App() {
  const [currentView, setCurrentView] = useState<NavigationItem>('dashboard')
  const [aiSearchQuery, setAiSearchQuery] = useState('')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const { error, clearError, session } = useSession()

  // Hash-based routing synchronization to support refresh & direct navigation
  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash || ''
      if (hash.startsWith('#/search') || hash.startsWith('#/agent')) {
        const queryParams = new URLSearchParams(hash.split('?')[1] || '')
        const q = queryParams.get('q')
        setCurrentView('agent')
        if (q) setAiSearchQuery(q)
      } else if (hash.startsWith('#/catalog')) {
        const queryParams = new URLSearchParams(hash.split('?')[1] || '')
        const cat = queryParams.get('category')
        const q = queryParams.get('q')
        if (cat) setSelectedCategory(cat)
        if (q) setCatalogQuery(q)
        setCurrentView('catalog')
      } else if (hash.startsWith('#/compare')) {
        setCurrentView('compare')
      } else if (hash.startsWith('#/orders')) {
        setCurrentView('orders')
      } else if (hash.startsWith('#/dashboard')) {
        setCurrentView('dashboard')
      } else {
        setCurrentView('dashboard')
      }
    }

    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [])

  const handleSelectView = (view: NavigationItem) => {
    setCurrentView(view)
    if (view === 'agent') {
      window.location.hash = aiSearchQuery ? `#/search?q=${encodeURIComponent(aiSearchQuery)}` : '#/agent'
    } else if (view === 'dashboard') {
      window.location.hash = '#/dashboard'
    } else if (view === 'catalog') {
      window.location.hash = '#/catalog'
    } else if (view === 'compare') {
      window.location.hash = '#/compare'
    } else if (view === 'orders') {
      window.location.hash = '#/orders'
    }
  }

  const handleSearchWithAI = (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setAiSearchQuery(trimmed)
    setCurrentView('agent')
    const targetHash = `#/search?q=${encodeURIComponent(trimmed)}`
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash
    }
  }

  const handleAgentQuerySubmitted = useCallback((q: string) => {
    setAiSearchQuery(q)
    const targetHash = `#/search?q=${encodeURIComponent(q)}`
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash
    }
  }, [])

  const handleNavigateToCatalog = (category?: string, query?: string) => {
    if (category !== undefined) setSelectedCategory(category)
    if (query !== undefined) setCatalogQuery(query)
    setCurrentView('catalog')
    window.location.hash = '#/catalog'
  }

  return (
    <div className="app-layout">
      {/* Desktop Persistent Sidebar (>= 900px) */}
      <SidebarNavigation currentView={currentView} onSelectView={handleSelectView} />

      {/* Main Content Stage */}
      <div className="main-stage">
        {/* Mobile Header Bar (<= 900px) */}
        <Navbar currentView={currentView} onSelectView={handleSelectView} />

        {/* Global Error Banner */}
        {error && (
          <div style={{ maxWidth: '1200px', margin: '16px auto 0', padding: '0 24px', width: '100%' }}>
            <div
              className="alert alert-error"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={clearError}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Main Content Container - Seven Page Unified Flow */}
        <main className="content-container">
          {currentView === 'dashboard' ? (
            <DashboardView
              onSearchWithAI={handleSearchWithAI}
              onNavigateToCatalog={handleNavigateToCatalog}
              onNavigateToCompare={() => handleSelectView('compare')}
              onNavigateToOrders={() => handleSelectView('orders')}
            />
          ) : currentView === 'catalog' ? (
            <CatalogView
              initialQuery={catalogQuery}
              initialCategory={selectedCategory}
              onNavigateToCompare={() => handleSelectView('compare')}
            />
          ) : currentView === 'compare' ? (
            <ProductComparisonView onNavigateToCatalog={() => handleSelectView('catalog')} />
          ) : currentView === 'agent' ? (
            <AgentChatView
              initialQuery={aiSearchQuery}
              onQuerySubmitted={handleAgentQuerySubmitted}
            />
          ) : (
            <OrdersHistoryView onNavigateToCatalog={() => handleSelectView('catalog')} />
          )}
        </main>

        {/* Global Modals & Drawers */}
        <CartDrawer />
        <CheckoutModal />
        <PaymentModal onNavigateToOrders={() => handleSelectView('orders')} />
        <OrderDetailsModal onNavigateToOrders={() => handleSelectView('orders')} />
        <ComparisonModal />

        {/* Footer */}
        <footer
          style={{
            borderTop: '1px solid var(--color-border)',
            padding: '20px 24px',
            backgroundColor: 'var(--color-neutral)',
            marginTop: 'auto',
            fontSize: '0.8rem',
            color: 'var(--color-text-secondary)',
          }}
        >
          <div
            style={{
              maxWidth: '1200px',
              margin: '0 auto',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={14} color="var(--color-secondary)" />
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>PayPilot AI Gateway</span>
              <span>&bull;</span>
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                {session ? 'Session Active' : 'Initializing...'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Shield size={13} color="var(--color-secondary)" />
                HMAC-Signed Previews
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Lock size={13} color="var(--color-secondary)" />
                Zero Client Secrets
              </span>
              <span>Synthetic Demo Payment Flow (PAYPAL_MODE=mock)</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
