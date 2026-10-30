import React, { useEffect, useState } from 'react'
import { X, Scale, Star, ShoppingCart, Trash2, Check } from 'lucide-react'
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
  const [addedIds, setAddedIds] = useState<string[]>([])

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

  const handleAddToCart = async (productId: string) => {
    const ok = await addToCart(productId, 1)
    if (ok) {
      setAddedIds((prev) => [...prev, productId])
      setTimeout(() => {
        setAddedIds((prev) => prev.filter((id) => id !== productId))
      }, 2000)
    }
  }

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
        style={{ maxWidth: '980px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              <Scale size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
                Product Comparison
              </h2>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                Comparing {products.length} selected catalog items
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {products.length > 0 && (
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '6px 12px', fontSize: '0.8rem', color: 'var(--color-error)' }}
                onClick={clearComparison}
              >
                <Trash2 size={13} />
                <span>Clear All</span>
              </button>
            )}
            <button
              id="comparison-modal-close-btn"
              type="button"
              onClick={() => setIsComparisonOpen(false)}
              aria-label="Close comparison modal"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-secondary)' }}>
            Loading comparison details...
          </div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-secondary)' }}>
            <Scale size={36} color="var(--color-secondary)" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
              No products selected for comparison
            </h3>
            <p style={{ fontSize: '0.85rem', margin: 0 }}>
              Click the Compare button on any product card in the catalog or assistant to compare specs side by side.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', paddingBottom: '10px' }}>
            <div className="comparison-grid" style={{ minWidth: `${products.length * 240}px` }}>
              {products.map((prod) => {
                const isAdded = addedIds.includes(prod.id)
                const isOutOfStock = prod.stock_qty <= 0

                return (
                  <div key={prod.id} className="comparison-col">
                    {/* Image & Remove */}
                    <div style={{ position: 'relative', width: '100%', height: '140px', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'var(--color-tertiary)' }}>
                      <img
                        src={prod.image_url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300'}
                        alt={prod.name}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      />
                      <button
                        type="button"
                        onClick={() => toggleCompareProduct(prod.id)}
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          background: 'rgba(33, 21, 47, 0.75)',
                          color: 'var(--color-neutral)',
                          border: 'none',
                          borderRadius: '50%',
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                        title="Remove from comparison"
                      >
                        <X size={13} />
                      </button>
                    </div>

                    {/* Basic Info */}
                    <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        {prod.brand || 'PayPilot'} &bull; {prod.category}
                      </div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '4px 0 6px', color: 'var(--color-text-primary)' }}>
                        {prod.name}
                      </h4>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                        {formatCurrency(prod.price_minor, prod.currency)}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: isOutOfStock ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 600 }}>
                        {isOutOfStock ? 'Out of Stock' : `${prod.stock_qty} in stock`}
                      </div>
                    </div>

                    {/* Rating */}
                    {prod.rating && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#F59E0B', fontWeight: 700 }}>
                        <Star size={13} fill="#F59E0B" stroke="#F59E0B" />
                        <span>{prod.rating.toFixed(1)} / 5.0</span>
                      </div>
                    )}

                    {/* Add to Cart */}
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleAddToCart(prod.id)}
                      disabled={isOutOfStock || isCartLoading}
                      style={{ padding: '8px 12px', fontSize: '0.82rem', width: '100%' }}
                    >
                      {isAdded ? <Check size={14} /> : <ShoppingCart size={14} />}
                      <span>{isAdded ? 'Added' : 'Add to Cart'}</span>
                    </button>

                    {/* Specs Table */}
                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                        Specifications
                      </div>
                      {allSpecKeys.map((key) => {
                        const val = prod.metadata_json?.[key]
                        return (
                          <div
                            key={key}
                            style={{
                              padding: '4px 6px',
                              backgroundColor: 'var(--color-tertiary)',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              border: '1px solid var(--color-border)',
                            }}
                          >
                            <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>{key.replace('_', ' ')}:</span>{' '}
                            <span style={{ color: 'var(--color-text-primary)' }}>{val !== undefined ? String(val) : '—'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
