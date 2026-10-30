import React, { useEffect, useState } from 'react'
import {
  Receipt,
  PackageCheck,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertOctagon,
  ArrowRight,
  ShieldCheck,
  TrendingDown,
  ShoppingBag,
  Info,
} from 'lucide-react'
import { useSession } from '../context/useSession'
import { api } from '../api/client'
import type { OrderData } from '../api/types'
import { formatCurrency } from '../utils/currency'
import { getProductImageUrl } from '../utils/productImages'

interface OrdersHistoryViewProps {
  onNavigateToCatalog?: () => void
}

export const OrdersHistoryView: React.FC<OrdersHistoryViewProps> = ({ onNavigateToCatalog }) => {
  const { session, token, setActiveOrder, setIsOrderDetailsOpen } = useSession()

  const [orders, setOrders] = useState<OrderData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadTrigger, setReloadTrigger] = useState(0)

  useEffect(() => {
    let isMounted = true
    const loadOrders = async () => {
      await Promise.resolve()
      if (!isMounted) return
      if (!session?.session_id || !token) return

      setIsLoading(true)
      setError(null)
      try {
        const data = await api.listSessionOrders(session.session_id, token)
        if (isMounted) {
          setOrders(data)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch session orders')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadOrders()
    return () => {
      isMounted = false
    }
  }, [session, token, reloadTrigger])

  // Financial aggregates calculated strictly from session orders
  const paidOrders = orders.filter((o) => o.status === 'paid')
  const totalSettledMinor = paidOrders.reduce((sum, o) => sum + (o.total_minor || 0), 0)
  const totalItemsCount = paidOrders.reduce(
    (sum, o) => sum + (o.items?.reduce((iSum, item) => iSum + (item.quantity || 1), 0) || 0),
    0
  )
  const currency = orders[0]?.currency || 'USD'

  const handleOpenReceipt = (order: OrderData) => {
    setActiveOrder(order)
    setIsOrderDetailsOpen(true)
  }

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '9999px',
              background: 'rgba(21, 128, 61, 0.1)',
              color: 'var(--color-success)',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              border: '1px solid rgba(21, 128, 61, 0.25)',
            }}
          >
            <CheckCircle size={13} />
            Paid
          </span>
        )
      case 'payment_processing':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '9999px',
              background: 'rgba(180, 83, 9, 0.08)',
              color: 'var(--color-warning)',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              border: '1px solid rgba(180, 83, 9, 0.25)',
            }}
          >
            <Clock size={13} />
            Processing
          </span>
        )
      case 'payment_failed':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '9999px',
              background: 'rgba(220, 38, 38, 0.1)',
              color: 'var(--color-error)',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              border: '1px solid rgba(220, 38, 38, 0.25)',
            }}
          >
            <AlertOctagon size={13} />
            Failed
          </span>
        )
      case 'pending_payment':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '9999px',
              background: 'var(--color-tertiary)',
              color: 'var(--color-secondary)',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              border: '1px solid var(--color-border)',
            }}
          >
            <Clock size={13} />
            Stock Reserved
          </span>
        )
      case 'cancelled':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '9999px',
              background: 'rgba(220, 38, 38, 0.1)',
              color: 'var(--color-error)',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              border: '1px solid rgba(220, 38, 38, 0.25)',
            }}
          >
            <AlertOctagon size={13} />
            Cancelled / Expired
          </span>
        )
      default:
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '9999px',
              background: 'var(--color-tertiary)',
              color: 'var(--color-text-secondary)',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              border: '1px solid var(--color-border)',
            }}
          >
            <Clock size={13} />
            {status}
          </span>
        )
    }
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '28px',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              margin: '0 0 6px',
              color: 'var(--color-text-primary)',
            }}
          >
            <Receipt size={26} color="var(--color-secondary)" />
            Orders &amp; Session Spend History
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            Real-time orders placed during your secure shopping session.
          </p>
        </div>

        <button
          id="refresh-orders-btn"
          type="button"
          className="btn btn-outline"
          onClick={() => setReloadTrigger((prev) => prev + 1)}
          disabled={isLoading}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
        >
          <RefreshCw size={15} className={isLoading ? 'spin-animation' : ''} />
          <span>{isLoading ? 'Updating...' : 'Refresh Orders'}</span>
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: '24px' }}>
          <span>{error}</span>
        </div>
      )}

      {/* Financial Aggregates & Architecture Scope Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        {/* Settled Spend */}
        <div
          className="matte-card"
          style={{
            padding: '22px',
            borderRadius: '12px',
            backgroundColor: 'var(--color-neutral)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 700, letterSpacing: '0.04em' }}>
              SESSION SETTLED SPEND
            </span>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'rgba(21, 128, 61, 0.1)',
                color: 'var(--color-success)',
                border: '1px solid rgba(21, 128, 61, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TrendingDown size={18} />
            </div>
          </div>
          <div
            id="session-total-spend"
            style={{
              fontSize: '1.85rem',
              fontWeight: 800,
              color: 'var(--color-text-primary)',
              marginBottom: '4px',
            }}
          >
            {formatCurrency(totalSettledMinor, currency)}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            Across {paidOrders.length} confirmed paid transaction{paidOrders.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Total Orders Placed */}
        <div
          className="matte-card"
          style={{
            padding: '22px',
            borderRadius: '12px',
            backgroundColor: 'var(--color-neutral)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 700, letterSpacing: '0.04em' }}>
              SESSION ORDERS
            </span>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'var(--color-tertiary)',
                color: 'var(--color-secondary)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PackageCheck size={18} />
            </div>
          </div>
          <div
            id="session-orders-count"
            style={{
              fontSize: '1.85rem',
              fontWeight: 800,
              color: 'var(--color-text-primary)',
              marginBottom: '4px',
            }}
          >
            {orders.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            {totalItemsCount} total item{totalItemsCount === 1 ? '' : 's'} committed in inventory
          </div>
        </div>

        {/* Precise Architecture Note on Budget Tracking */}
        <div
          className="purple-surface-panel"
          style={{
            padding: '20px',
            borderRadius: '12px',
            gridColumn: 'span 2',
            backgroundColor: 'var(--color-tertiary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'var(--color-neutral)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '2px',
              }}
            >
              <Info size={18} />
            </div>
            <div>
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: 'var(--color-text-primary)',
                  marginBottom: '4px',
                }}
              >
                Architecture Data Note: Budget Tracking Boundary
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>
                PayPilot operates on anonymous, privacy-first bearer sessions with zero stored user
                credentials. Spend totals are computed directly from confirmed orders in this active session.
                Persistent multi-session budget quotas, monthly limits, and balance accounts are not modeled
                in the database. Budget constraints in queries are evaluated dynamically by the knapsack optimization engine.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Orders List / Empty State */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
          Placed Orders ({orders.length})
        </h2>

        {orders.length === 0 ? (
          <div
            id="orders-empty-state"
            className="matte-card"
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              borderRadius: '14px',
              border: '1px dashed var(--color-secondary)',
              backgroundColor: 'var(--color-neutral)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'var(--color-tertiary)',
                color: 'var(--color-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                border: '1px solid var(--color-border)',
              }}
            >
              <ShoppingBag size={28} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
              No orders placed yet in this session
            </h3>
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary)',
                maxWidth: '460px',
                margin: '0 auto 20px',
                lineHeight: 1.5,
              }}
            >
              Explore our catalog or submit queries to the AI Assistant. Add products to your cart and complete checkout to review receipts here.
            </p>
            {onNavigateToCatalog && (
              <button
                id="empty-orders-browse-btn"
                type="button"
                className="btn btn-primary"
                onClick={onNavigateToCatalog}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                <span>Browse Catalog</span>
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {orders.map((order) => {
              const formattedTotal = formatCurrency(order.total_minor, order.currency)
              return (
                <div
                  key={order.id}
                  id={`order-card-${order.id}`}
                  className="matte-card"
                  style={{
                    padding: '20px 24px',
                    borderRadius: '12px',
                    backgroundColor: 'var(--color-neutral)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {/* Order Card Header */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                      paddingBottom: '14px',
                      borderBottom: '1px solid var(--color-border)',
                      marginBottom: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {order.order_number || order.id}
                      </span>
                      {getStatusBadge(order.status)}
                      {order.is_demo_payment && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--color-secondary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'var(--color-tertiary)',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid var(--color-border)',
                            fontWeight: 600,
                          }}
                        >
                          <ShieldCheck size={12} />
                          Demo Mode
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                        {new Date(order.created_at).toLocaleString()}
                      </span>
                      <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                        {formattedTotal}
                      </span>
                    </div>
                  </div>

                  {/* Items Preview Table */}
                  <div style={{ marginBottom: '16px' }}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto auto',
                        gap: '12px',
                        padding: '6px 0',
                        fontSize: '0.78rem',
                        color: 'var(--color-text-secondary)',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        borderBottom: '1px solid var(--color-border)',
                      }}
                    >
                      <span>ITEM</span>
                      <span style={{ textAlign: 'center', width: '60px' }}>QTY</span>
                      <span style={{ textAlign: 'right', width: '80px' }}>TOTAL</span>
                    </div>

                    {(order.items || []).map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto auto',
                          gap: '12px',
                          padding: '10px 0',
                          fontSize: '0.85rem',
                          borderBottom: '1px solid var(--color-border)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <img
                            src={getProductImageUrl(item.product_image_url, item.product_name)}
                            alt={item.product_name}
                            style={{
                              width: '36px',
                              height: '36px',
                              objectFit: 'contain',
                              borderRadius: '6px',
                              backgroundColor: 'var(--color-tertiary)',
                              border: '1px solid var(--color-border)',
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                            {item.product_name}
                          </span>
                        </div>
                        <span
                          style={{
                            textAlign: 'center',
                            width: '60px',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          &times; {item.quantity}
                        </span>
                        <span
                          style={{
                            textAlign: 'right',
                            width: '80px',
                            color: 'var(--color-text-primary)',
                            fontWeight: 700,
                          }}
                        >
                          {formatCurrency(item.line_total_minor, item.currency)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Order Footer & Action */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                      paddingTop: '6px',
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {order.payment_attempts?.length || 0} payment attempt
                      {order.payment_attempts?.length === 1 ? '' : 's'} recorded &bull; Stock holds guaranteed
                    </div>

                    <button
                      id={`view-receipt-btn-${order.id}`}
                      type="button"
                      className="btn btn-outline"
                      onClick={() => handleOpenReceipt(order)}
                      style={{
                        padding: '6px 14px',
                        fontSize: '0.82rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Receipt size={14} />
                      <span>View Full Receipt</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
