import React, { useEffect, useState } from 'react'
import { X, Layers, Star, ShoppingCart, Trash2 } from 'lucide-react'
import { useSession } from '../context/useSession'
import { api } from '../api/client'
import type { ProductDetail } from '../api/types'
import { formatCurrency } from '../utils/currency'

export const ComparisonModal: React.FC = () => {
  const {
    comparisonIds,
    toggleCompareProduct,
    clearComparison,
    isComparisonOpen,
    setIsComparisonOpen,
    addToCart,
    isCartLoading,
  } = useSession()

  const [products, setProducts] = useState<ProductDetail[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let isMounted = true
    const fetchDetails = async () => {
      await Promise.resolve()
      if (!isMounted) return
      if (!isComparisonOpen || comparisonIds.length === 0) {
        setProducts([])
        return
      }
      try {
        setIsLoading(true)
        const details = await Promise.all(
          comparisonIds.map((id) => api.getProduct(id))
        )
        if (isMounted) {
          setProducts(details)
        }
      } catch (err) {
        console.error('Failed to load comparison products', err)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchDetails()
    return () => {
      isMounted = false
    }
  }, [isComparisonOpen, comparisonIds])

  if (!isComparisonOpen) return null

  // Collect all unique specification keys across products
  const allSpecKeys = Array.from(
    new Set(
      products.flatMap((p) => (p.metadata_json ? Object.keys(p.metadata_json) : []))
    )
  )

  return (
    <div className="modal-backdrop" onClick={() => setIsComparisonOpen(false)}>
      <div
        className="modal-card"
        style={{ maxWidth: '960px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(139, 92, 246, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-secondary)',
              }}
            >
              <Layers size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Side-by-Side Product Comparison</h2>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)' }}>
                Comparing {products.length} catalog items
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              onClick={clearComparison}
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={() => setIsComparisonOpen(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Comparison Content */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
            Loading comparison details...
          </div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            No products selected for comparison. Click the &ldquo;+&rdquo; icon on any product card.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr>
                  <th style={{ width: '160px', textAlign: 'left', padding: '12px', color: 'var(--text-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                    Feature
                  </th>
                  {products.map((p) => (
                    <th
                      key={p.id}
                      style={{
                        padding: '12px',
                        textAlign: 'left',
                        verticalAlign: 'top',
                        borderBottom: '1px solid var(--border-subtle)',
                        minWidth: '200px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem', marginBottom: '4px' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.brand}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleCompareProduct(p.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}
                          title="Remove from comparison"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Image & Price */}
                <tr>
                  <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Price</td>
                  {products.map((p) => (
                    <td key={p.id} style={{ padding: '12px', fontWeight: 800, fontSize: '1.15rem', color: 'var(--text-main)' }}>
                      {formatCurrency(p.price_minor, p.currency)}
                    </td>
                  ))}
                </tr>

                {/* Rating */}
                <tr>
                  <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Rating</td>
                  {products.map((p) => (
                    <td key={p.id} style={{ padding: '12px' }}>
                      {p.rating ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#fbbf24' }}>
                          <Star size={14} fill="#fbbf24" stroke="#fbbf24" />
                          <span>{p.rating.toFixed(1)} / 5</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-subtle)' }}>Unrated</span>
                      )}
                    </td>
                  ))}
                </tr>

                {/* Category & Stock */}
                <tr>
                  <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Stock</td>
                  {products.map((p) => (
                    <td key={p.id} style={{ padding: '12px', color: p.stock_qty > 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)' }}>
                      {p.stock_qty > 0 ? `${p.stock_qty} available` : 'Out of stock'}
                    </td>
                  ))}
                </tr>

                {/* Specifications Rows */}
                {allSpecKeys.map((key) => (
                  <tr key={key} style={{ borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                      {key.replace('_', ' ')}
                    </td>
                    {products.map((p) => {
                      const val = p.metadata_json?.[key]
                      return (
                        <td key={p.id} style={{ padding: '12px', color: val !== undefined ? 'var(--text-main)' : 'var(--text-subtle)' }}>
                          {val !== undefined ? String(val) : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* Add to Cart Actions Row */}
                <tr style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '12px' }} />
                  {products.map((p) => (
                    <td key={p.id} style={{ padding: '12px' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        onClick={() => addToCart(p.id, 1)}
                        disabled={isCartLoading || p.stock_qty <= 0}
                      >
                        <ShoppingCart size={15} />
                        <span>Add to Cart</span>
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
