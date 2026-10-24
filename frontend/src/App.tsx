import { useState } from 'react'
import { Navbar } from './components/Navbar'
import { CatalogView } from './components/CatalogView'
import { AgentChatView } from './components/AgentChatView'
import { CartDrawer } from './components/CartDrawer'
import { CheckoutModal } from './components/CheckoutModal'
import { PaymentModal } from './components/PaymentModal'
import { OrderDetailsModal } from './components/OrderDetailsModal'
import { ComparisonModal } from './components/ComparisonModal'
import { useSession } from './context/useSession'
import { AlertCircle, X, Shield, Lock, Server } from 'lucide-react'

export function App() {
  const [currentView, setCurrentView] = useState<'catalog' | 'agent'>('catalog')
  const { error, clearError, session } = useSession()

  return (
    <div className="app-container">
      {/* Navigation Bar */}
      <Navbar currentView={currentView} onSelectView={setCurrentView} />

      {/* Global Error Banner */}
      {error && (
        <div style={{ maxWidth: '1280px', margin: '16px auto 0', padding: '0 20px', width: '100%' }}>
          <div className="alert alert-error" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

      {/* Main View Area */}
      <main className="main-content">
        {currentView === 'catalog' ? <CatalogView /> : <AgentChatView />}
      </main>

      {/* Overlays, Drawers & Modals */}
      <CartDrawer />
      <CheckoutModal />
      <PaymentModal />
      <OrderDetailsModal />
      <ComparisonModal />

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '24px 20px',
          background: 'rgba(9, 13, 22, 0.9)',
          marginTop: 'auto',
          fontSize: '0.8rem',
          color: 'var(--text-subtle)',
        }}
      >
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Server size={14} color="var(--accent-primary)" />
            <span>PayPilot AI Shopper Gateway</span>
            <span>&bull;</span>
            <span style={{ color: 'var(--accent-emerald)' }}>Connected: {session ? 'Active' : 'Initializing'}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Shield size={13} color="var(--accent-cyan)" />
              HMAC-Signed Previews
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Lock size={13} color="var(--accent-emerald)" />
              Zero Client Secrets
            </span>
            <span>PayPal REST API v2 Sandbox</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
