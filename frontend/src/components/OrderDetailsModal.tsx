import React from 'react'
import { X, Receipt, CheckCircle, Clock, ShieldCheck } from 'lucide-react'
import { useSession } from '../context/useSession'
import { formatCurrency } from '../utils/currency'

export const OrderDetailsModal: React.FC = () => {
  const { activeOrder, isOrderDetailsOpen, setIsOrderDetailsOpen } = useSession()

  if (!isOrderDetailsOpen || !activeOrder) return null

  const totalFormatted = formatCurrency(activeOrder.total_minor, activeOrder.currency)
  const isPaid = activeOrder.status === 'paid'

  return (
    <div className="modal-backdrop" onClick={() => setIsOrderDetailsOpen(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: isPaid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isPaid ? 'var(--accent-emerald)' : 'var(--accent-primary)',
              }}
            >
              <Receipt size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Order Receipt</h2>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
                Order #{activeOrder.order_number || activeOrder.id}
              </div>
            </div>
          </div>
          <button
            id="order-details-close-btn"
            type="button"
            onClick={() => setIsOrderDetailsOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}
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
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isPaid ? (
              <CheckCircle size={18} color="var(--accent-emerald)" />
            ) : (
              <Clock size={18} color="var(--accent-amber)" />
            )}
            <span
              id="order-receipt-status"
              style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', color: isPaid ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}
            >
              {activeOrder.status.replace('_', ' ')}
            </span>
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
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
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '20px',
            color: 'var(--accent-primary)',
            fontSize: '0.82rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={16} />
            <span style={{ fontWeight: 600 }}>Demo payment — no real payment processed</span>
          </div>
          <span
            style={{
              fontSize: '0.7rem',
              background: 'rgba(99, 102, 241, 0.25)',
              padding: '2px 8px',
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
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
            Purchased Products:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeOrder.items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'rgba(30, 41, 59, 0.4)',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.product_name}</span>
                  <span style={{ color: 'var(--text-subtle)', marginLeft: '8px' }}>
                    &times; {item.quantity} ({formatCurrency(item.unit_price_minor, item.currency || activeOrder.currency)})
                  </span>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
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
            borderTop: '1px solid var(--border-subtle)',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '20px',
          }}
        >
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>Order Total:</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
            {totalFormatted}
          </div>
        </div>

        {/* Payment Attempts History */}
        {activeOrder.payment_attempts.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={14} color="var(--accent-primary)" />
              <span>Payment Attempts Audit Trail:</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {activeOrder.payment_attempts.map((att) => (
                <div
                  key={att.attempt_id}
                  style={{
                    padding: '10px 14px',
                    background: 'rgba(15, 23, 42, 0.5)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                      Attempt #{att.attempt_number} ({att.status.toUpperCase()})
                    </span>
                    <span style={{ color: 'var(--text-subtle)' }}>
                      {new Date(att.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Attempt ID: <code>{att.attempt_id}</code>
                  </div>

                  <div style={{ color: isPaid ? 'var(--accent-emerald)' : 'var(--accent-amber)', marginTop: '4px', fontSize: '0.75rem' }}>
                    Status: {att.status.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Close Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
