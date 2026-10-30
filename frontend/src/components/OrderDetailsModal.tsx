import React from 'react'
import { X, Receipt, CheckCircle, Clock, ShieldCheck } from 'lucide-react'
import { useSession } from '../context/useSession'
import { formatCurrency } from '../utils/currency'
import { getProductImageUrl } from '../utils/productImages'

interface OrderDetailsModalProps {
  onNavigateToOrders?: () => void
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ onNavigateToOrders }) => {
  const { activeOrder, isOrderDetailsOpen, setIsOrderDetailsOpen } = useSession()

  if (!isOrderDetailsOpen || !activeOrder) return null

  const totalFormatted = formatCurrency(activeOrder.total_minor, activeOrder.currency)
  const isPaid = activeOrder.status === 'paid'

  return (
    <div className="modal-backdrop" onClick={() => setIsOrderDetailsOpen(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '16px',
            borderBottom: '1px solid var(--color-border)',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: isPaid ? 'rgba(21, 128, 61, 0.1)' : 'var(--color-tertiary)',
                border: `1px solid ${isPaid ? 'rgba(21, 128, 61, 0.25)' : 'var(--color-border)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isPaid ? 'var(--color-success)' : 'var(--color-secondary)',
              }}
            >
              <Receipt size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text-primary)', margin: 0 }}>
                Order Receipt
              </h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                Order #{activeOrder.order_number || activeOrder.id}
              </div>
            </div>
          </div>
          <button
            id="order-details-close-btn"
            type="button"
            onClick={() => setIsOrderDetailsOpen(false)}
            aria-label="Close Order Receipt"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Status Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: isPaid ? 'rgba(21, 128, 61, 0.1)' : 'rgba(180, 83, 9, 0.08)',
            border: `1px solid ${isPaid ? 'rgba(21, 128, 61, 0.25)' : 'rgba(180, 83, 9, 0.25)'}`,
            padding: '12px 16px',
            borderRadius: '10px',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isPaid ? (
              <CheckCircle size={18} color="var(--color-success)" />
            ) : (
              <Clock size={18} color="var(--color-warning)" />
            )}
            <span
              id="order-receipt-status"
              style={{
                fontSize: '0.88rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: isPaid ? 'var(--color-success)' : 'var(--color-warning)',
              }}
            >
              {activeOrder.status.replace('_', ' ')}
            </span>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            Placed: {new Date(activeOrder.created_at).toLocaleString()}
          </div>
        </div>

        {/* Demo Mode Notice Banner */}
        <div
          id="demo-receipt-notice"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-tertiary)',
            border: '1px solid var(--color-border)',
            borderRadius: '10px',
            padding: '10px 14px',
            marginBottom: '20px',
            color: 'var(--color-text-primary)',
            fontSize: '0.82rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={16} color="var(--color-secondary)" />
            <span style={{ fontWeight: 600 }}>Demo payment — no real payment processed</span>
          </div>
          <span
            style={{
              fontSize: '0.7rem',
              background: 'var(--color-secondary)',
              color: 'var(--color-neutral)',
              padding: '3px 8px',
              borderRadius: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontWeight: 700,
            }}
          >
            Synthetic Mock
          </span>
        </div>

        {/* Items Table */}
        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              marginBottom: '10px',
            }}
          >
            Purchased Products
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeOrder.items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  background: 'var(--color-neutral)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img
                    src={getProductImageUrl(undefined, item.product_name)}
                    alt={item.product_name}
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '6px',
                      objectFit: 'contain',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-tertiary)',
                      padding: '2px',
                    }}
                  />
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.product_name}</span>
                    <span style={{ color: 'var(--color-text-secondary)', marginLeft: '8px', fontSize: '0.8rem' }}>
                      &times; {item.quantity} ({formatCurrency(item.unit_price_minor, item.currency || activeOrder.currency)})
                    </span>
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {formatCurrency(item.line_total_minor, item.currency || activeOrder.currency)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Order Total */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 0',
            borderTop: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border)',
            marginBottom: '20px',
          }}
        >
          <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Total Settled:</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {totalFormatted}
          </div>
        </div>

        {/* Payment Attempts History */}
        {activeOrder.payment_attempts.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ShieldCheck size={15} color="var(--color-secondary)" />
              <span>Payment Attempts Audit Trail</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeOrder.payment_attempts.map((att) => (
                <div
                  key={att.attempt_id}
                  style={{
                    padding: '10px 14px',
                    background: 'var(--color-tertiary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      Attempt #{att.attempt_number}
                    </span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>
                      {new Date(att.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    Attempt ID:{' '}
                    <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                      {att.attempt_id}
                    </code>
                  </div>

                  <div
                    style={{
                      marginTop: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: att.status === 'captured' ? 'var(--color-success)' : 'var(--color-warning)',
                    }}
                  >
                    Status: {att.status.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          {onNavigateToOrders && (
            <button
              id="order-details-view-history-btn"
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setIsOrderDetailsOpen(false)
                onNavigateToOrders()
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Receipt size={14} />
              <span>All Orders &amp; Spend</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsOrderDetailsOpen(false)}
          >
            Close Receipt
          </button>
        </div>
      </div>
    </div>
  )
}
