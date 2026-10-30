import React, { useEffect, useState } from 'react'
import {
  Sparkles,
  Search,
  Scale,
  Receipt,
  Headphones,
  Laptop,
  Keyboard,
  Monitor,
  Gamepad2,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal,
  ShoppingCart,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { useSession } from '../context/useSession'
import { api } from '../api/client'
import type { ProductItem, OrderData } from '../api/types'
import { ProductCard } from './ProductCard'
import { formatCurrency } from '../utils/currency'

interface DashboardViewProps {
  onSearchWithAI: (query: string) => void
  onNavigateToCatalog: (category?: string) => void
  onNavigateToCompare: () => void
  onNavigateToOrders: () => void
}

const CATEGORIES_DATA = [
  { name: 'Audio', label: 'Audio & ANC', icon: Headphones, count: '6 catalog models' },
  { name: 'Laptops', label: 'Laptops & Workstations', icon: Laptop, count: '4 catalog models' },
  { name: 'Keyboards', label: 'Mechanical Keyboards', icon: Keyboard, count: '3 catalog models' },
  { name: 'Monitors', label: '4K UltraSharp Displays', icon: Monitor, count: '2 catalog models' },
  { name: 'Accessories', label: 'Mice & Accessories', icon: SlidersHorizontal, count: '3 catalog models' },
  { name: 'Gaming', label: 'Gaming Consoles', icon: Gamepad2, count: '2 catalog models' },
]

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSearchWithAI,
  onNavigateToCatalog,
  onNavigateToCompare,
  onNavigateToOrders,
}) => {
  const { session, token, cart, comparisonIds, setIsCartOpen } = useSession()

  const [searchQuery, setSearchQuery] = useState('')
  const [searchInlineError, setSearchInlineError] = useState<string | null>(null)
  const [topProducts, setTopProducts] = useState<ProductItem[]>([])
  const [recentOrders, setRecentOrders] = useState<OrderData[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [totalSpentMinor, setTotalSpentMinor] = useState(0)

  useEffect(() => {
    let isMounted = true
    const loadDashboardData = async () => {
      setIsLoadingProducts(true)
      try {
        const prodRes = await api.listProducts({ page_size: 4, sort_by: 'rating' })
        if (isMounted) {
          setTopProducts(prodRes.items)
        }
      } catch (err) {
        console.error('Failed to load dashboard products', err)
      } finally {
        if (isMounted) setIsLoadingProducts(false)
      }

      if (session?.session_id && token) {
        try {
          const ordersRes = await api.listSessionOrders(session.session_id, token)
          if (isMounted) {
            setRecentOrders(ordersRes)
            const spent = ordersRes
              .filter((o) => o.status === 'paid')
              .reduce((sum, o) => sum + (o.total_minor || 0), 0)
            setTotalSpentMinor(spent)
          }
        } catch (err) {
          console.error('Failed to load dashboard orders', err)
        }
      }
    }

    loadDashboardData()
    return () => {
      isMounted = false
    }
  }, [session, token])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = searchQuery.trim()
    if (!trimmed) {
      setSearchInlineError('Please enter a product request before searching with AI.')
      return
    }
    setSearchInlineError(null)
    onSearchWithAI(trimmed)
  }

  const activeCurrency = cart?.currency || recentOrders[0]?.currency || 'USD'
  const cartSubtotal = cart?.subtotal_minor || 0
  const paidOrders = recentOrders.filter((o) => o.status === 'paid')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1240px', margin: '0 auto' }}>
      {/* Breadcrumb Row */}
      <div className="breadcrumb-row">
        <span>PAYPILOT AI</span>
        <span style={{ opacity: 0.6 }}>&gt;</span>
        <span style={{ color: 'var(--color-primary)' }}>DASHBOARD</span>
      </div>

      {/* Hero Welcome Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.95rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
            Welcome to PayPilot AI
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem', margin: 0 }}>
            Autonomous shopping assistant with deterministic knapsack optimization and zero-trust checkout.
          </p>
        </div>

        {/* Status Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              backgroundColor: 'var(--color-tertiary)',
              border: '1px solid var(--color-border)',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
            }}
          >
            <ShieldCheck size={14} color="var(--color-secondary)" />
            <span>HMAC Signed Previews &bull; Synthetic Demo Mode</span>
          </span>

          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              backgroundColor: 'rgba(21, 128, 61, 0.1)',
              border: '1px solid rgba(21, 128, 61, 0.25)',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: 'var(--color-success)',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-success)' }} />
            <span>Active Session</span>
          </span>
        </div>
      </div>

      {/* Prominent Natural Language AI Search Bar */}
      <div className="search-prompt-bar">
        <form onSubmit={handleSearchSubmit} className="prompt-input-row">
          <Sparkles size={20} color="var(--color-secondary)" style={{ flexShrink: 0 }} />
          <input
            id="dashboard-search-input"
            type="text"
            className="prompt-input-field"
            placeholder="Type any product request in your own words (e.g. noise-canceling headphones, lightweight laptop)..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              if (searchInlineError) setSearchInlineError(null)
            }}
          />
          <button
            id="dashboard-search-btn"
            type="submit"
            className="btn btn-primary"
            style={{ padding: '9px 18px', borderRadius: '8px', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Search size={15} />
            <span>Search with AI</span>
          </button>
        </form>

        {/* Inline Validation Error */}
        {searchInlineError && (
          <div
            id="dashboard-inline-error"
            className="search-inline-error"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '8px',
              color: 'var(--color-error)',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            <AlertCircle size={14} />
            <span>{searchInlineError}</span>
          </div>
        )}
      </div>

      {/* Truthful Session Spending & Cart Metric Cards (Per Active Session) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Cart Allocation Card */}
        <div
          className="matte-card"
          style={{
            padding: '20px',
            backgroundColor: 'var(--color-neutral)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
              Active Cart Subtotal
            </span>
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-secondary)',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <ShoppingCart size={12} />
              <span>View Cart</span>
              <ArrowRight size={12} />
            </button>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {formatCurrency(cartSubtotal, cart?.currency || activeCurrency)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            {cart?.item_count || 0} item{(cart?.item_count || 0) === 1 ? '' : 's'} in cart &bull; Server-authoritative
          </div>
        </div>

        {/* Session Settled Spend */}
        <div
          className="matte-card"
          style={{
            padding: '20px',
            backgroundColor: 'var(--color-neutral)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
              Session Settled Spend
            </span>
            <span className="badge badge-purple" style={{ fontSize: '0.68rem' }}>
              <TrendingUp size={11} />
              <span>Per Active Session</span>
            </span>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {formatCurrency(totalSpentMinor, activeCurrency)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            Across {paidOrders.length} confirmed paid order{paidOrders.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Session Orders Card */}
        <div
          className="matte-card"
          style={{
            padding: '20px',
            backgroundColor: 'var(--color-neutral)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
              Session Orders
            </span>
            <button
              type="button"
              onClick={onNavigateToOrders}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-secondary)',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Clock size={12} />
              <span>Order Ledger</span>
              <ArrowRight size={12} />
            </button>
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {recentOrders.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            {paidOrders.length} paid &bull; {recentOrders.length - paidOrders.length} pending / failed
          </div>
        </div>
      </div>

      {/* Floating Comparison Notice Bar (if items are being compared) */}
      {comparisonIds.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            borderRadius: '10px',
            backgroundColor: 'var(--color-primary)',
            color: 'white',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Scale size={18} />
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
              You have <strong>{comparisonIds.length}</strong> product{comparisonIds.length > 1 ? 's' : ''} queued for side-by-side comparison.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onNavigateToCompare}
            style={{ padding: '6px 14px', fontSize: '0.82rem', borderRadius: '6px' }}
          >
            Open Product Comparison &rarr;
          </button>
        </div>
      )}

      {/* Browse by Category Shelf */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '2px' }}>
              Browse Categories
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>
              Curated hardware and tech accessories from sample catalog.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onNavigateToCatalog()}
            style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '8px' }}
          >
            <span>View All Products</span>
            <ArrowRight size={13} />
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px',
          }}
        >
          {CATEGORIES_DATA.map((cat) => {
            const Icon = cat.icon
            return (
              <div
                key={cat.name}
                className="matte-card"
                onClick={() => onNavigateToCatalog(cat.name)}
                style={{
                  padding: '16px',
                  backgroundColor: 'var(--color-neutral)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-secondary)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--color-border)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
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
                  <Icon size={18} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-text-primary)' }}>
                  {cat.label}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                  {cat.count}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Top AI Recommendations Grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="var(--color-secondary)" />
              <span>Top AI Recommendations for your Session</span>
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>
              Ranked based on multi-criteria specification matching and pricing stability.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onNavigateToCatalog()}
            style={{ padding: '6px 14px', fontSize: '0.8rem', borderRadius: '8px' }}
          >
            <span>See All Results</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {isLoadingProducts ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-secondary)' }}>
            <RefreshCw size={24} className="spin-animation" style={{ margin: '0 auto 8px' }} />
            <div>Loading catalog recommendations...</div>
          </div>
        ) : (
          <div className="product-grid">
            {topProducts.map((prod, index) => (
              <ProductCard
                key={prod.id}
                product={prod}
                badgeType={index === 0 ? 'best_match' : index === 1 ? 'best_price' : null}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Orders Snapshot & Quick Access */}
      <div
        className="matte-card"
        style={{
          padding: '20px 24px',
          backgroundColor: 'var(--color-tertiary)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: 'var(--color-primary)',
              color: 'var(--color-neutral)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Receipt size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              Session Orders &amp; Spend History
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
              {recentOrders.length > 0
                ? `${recentOrders.length} order(s) placed &bull; Total spent: ${formatCurrency(totalSpentMinor, activeCurrency)}`
                : 'No orders placed in this session yet. Ready to explore products.'}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={onNavigateToOrders}
          style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.84rem' }}
        >
          <span>View Orders &amp; Spend</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}
