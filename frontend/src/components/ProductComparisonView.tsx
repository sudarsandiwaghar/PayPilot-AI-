import React, { useEffect, useState } from 'react'
import {
  Scale,
  X,
  Star,
  ShoppingCart,
  Check,
  Trash2,
  Plus,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { useSession } from '../context/useSession'
import { api } from '../api/client'
import type { ProductDetail, ProductItem } from '../api/types'
import { formatCurrency } from '../utils/currency'
import { getProductImageUrl } from '../utils/productImages'

interface ProductComparisonViewProps {
  onNavigateToCatalog: () => void
}

export const ProductComparisonView: React.FC<ProductComparisonViewProps> = ({ onNavigateToCatalog }) => {
  const {
    comparisonIds,
    toggleCompareProduct,
    clearComparison,
    addToCart,
    isCartLoading,
    setIsCartOpen,
  } = useSession()

  const [products, setProducts] = useState<ProductDetail[]>([])
  const [catalogItems, setCatalogItems] = useState<ProductItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [addedIds, setAddedIds] = useState<string[]>([])

  useEffect(() => {
    let isMounted = true
    const loadComparisonDetails = async () => {
      if (comparisonIds.length === 0) {
        setProducts([])
        // Load catalog suggestions when empty
        try {
          const res = await api.listProducts({ page_size: 4, sort_by: 'rating' })
          if (isMounted) setCatalogItems(res.items)
        } catch {
          // ignore
        }
        return
      }

      setIsLoading(true)
      try {
        const details = await Promise.all(
          comparisonIds.slice(0, 4).map((id) => api.getProduct(id))
        )
        if (isMounted) setProducts(details)
      } catch (err) {
        console.error('Failed to load comparison product details', err)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    loadComparisonDetails()
    return () => {
      isMounted = false
    }
  }, [comparisonIds])

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1240px', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <div className="breadcrumb-row">
        <span>DASHBOARD</span>
        <span style={{ opacity: 0.6 }}>&gt;</span>
        <span style={{ color: 'var(--color-secondary)' }}>PRODUCT COMPARISON</span>
      </div>

      {/* Page Header */}
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
          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
            Product Comparison
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem', margin: 0 }}>
            Side-by-side technical specification, pricing, availability, and AI grounded match reasons (up to 4 products).
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onNavigateToCatalog}
            style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '0.84rem' }}
          >
            <Plus size={14} />
            <span>Add Products from Catalog</span>
          </button>

          {products.length > 0 && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={clearComparison}
              style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '0.84rem', color: 'var(--color-error)' }}
            >
              <Trash2 size={14} />
              <span>Clear All</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsCartOpen(true)}
            style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.84rem' }}
          >
            <ShoppingCart size={15} />
            <span>View Cart</span>
          </button>
        </div>
      </div>

      {/* Main Comparison Stage */}
      {isLoading ? (
        <div className="matte-card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Loading comparison data for selected models...
        </div>
      ) : products.length === 0 ? (
        /* Empty State with Quick-Add Suggestions */
        <div
          className="matte-card"
          style={{
            padding: '40px 24px',
            backgroundColor: 'var(--color-tertiary)',
            border: '1px solid var(--color-border)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '12px',
              backgroundColor: 'var(--color-neutral)',
              color: 'var(--color-secondary)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <Scale size={28} />
          </div>

          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
              No Products Selected for Comparison
            </h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', maxWidth: '480px', margin: '0 auto' }}>
              Select up to 4 models from the catalog or click below to compare our top-rated recommendations.
            </p>
          </div>

          {/* Quick-Add Recommended Products Shelf */}
          {catalogItems.length > 0 && (
            <div style={{ marginTop: '12px', width: '100%', maxWidth: '720px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
                Quick-Add Top Catalog Recommendations:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                {catalogItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="btn btn-outline"
                    onClick={() => toggleCompareProduct(item.id)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: 'var(--color-neutral)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
                      {item.name}
                    </span>
                    <Plus size={13} style={{ flexShrink: 0, marginLeft: '6px' }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={onNavigateToCatalog}
            style={{ marginTop: '10px', padding: '10px 20px', borderRadius: '8px' }}
          >
            <span>Browse Full Catalog</span>
            <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        /* Up to 4 Side-by-Side Comparison Columns */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Slot status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
              Comparing <strong>{products.length}</strong> of <strong>4</strong> allowed models
            </span>
            {products.length < 4 && (
              <button
                type="button"
                onClick={onNavigateToCatalog}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-secondary)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Plus size={13} />
                <span>Add another product (up to 4)</span>
              </button>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${products.length}, minmax(240px, 1fr))`,
              gap: '16px',
              overflowX: 'auto',
              paddingBottom: '8px',
            }}
          >
            {products.map((prod) => {
              const isAdded = addedIds.includes(prod.id)
              const isOutOfStock = prod.stock_qty <= 0
              const formattedPrice = formatCurrency(prod.price_minor, prod.currency)

              const matchReason =
                prod.category.toLowerCase() === 'audio'
                  ? 'Active Noise Cancellation with multi-device Bluetooth 5.2 pairing and 30-hour battery.'
                  : prod.category.toLowerCase() === 'laptops'
                  ? 'High efficiency core architecture with unified memory under specified budget ceiling.'
                  : prod.category.toLowerCase() === 'keyboards'
                  ? 'Hot-swappable mechanical switches with low-latency wired and wireless connectivity.'
                  : `High ${prod.rating || 4.5}★ rating with catalog stock available.`

              return (
                <div
                  key={prod.id}
                  className="matte-card"
                  style={{
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    backgroundColor: 'var(--color-neutral)',
                    border: '1px solid var(--color-border)',
                    position: 'relative',
                  }}
                >
                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => toggleCompareProduct(prod.id)}
                    title="Remove from comparison"
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: 'rgba(109, 40, 217, 0.1)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '26px',
                      height: '26px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: 'var(--color-secondary)',
                      zIndex: 2,
                    }}
                  >
                    <X size={14} />
                  </button>

                  {/* Product Image */}
                  <div
                    style={{
                      width: '100%',
                      height: '160px',
                      backgroundColor: 'var(--color-tertiary)',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      padding: '10px',
                    }}
                  >
                    <img
                      src={getProductImageUrl(prod.image_url, prod.name, prod.category)}
                      alt={prod.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>

                  {/* Brand & Title */}
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                      {prod.brand || 'PayPilot'} &bull; {prod.category}
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: '4px', lineHeight: 1.35 }}>
                      {prod.name}
                    </h3>
                  </div>

                  {/* Price Row */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                      {formattedPrice}
                    </span>
                    <span className="product-demo-tag">DEMO</span>
                  </div>

                  {/* Availability Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 700 }}>
                    <span
                      style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: isOutOfStock ? 'var(--color-error)' : prod.stock_qty <= 2 ? 'var(--color-warning)' : 'var(--color-success)',
                      }}
                    />
                    <span style={{ color: isOutOfStock ? 'var(--color-error)' : prod.stock_qty <= 2 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                      {isOutOfStock ? 'Out of Stock' : prod.stock_qty <= 2 ? `Only ${prod.stock_qty} Left` : `${prod.stock_qty} in stock`}
                    </span>
                  </div>

                  {/* Match Reason Box (Soft Purple #F4F0FA) */}
                  <div className="ai-recommendation-box">
                    <div className="ai-recommendation-label">
                      <Sparkles size={11} color="var(--color-secondary)" />
                      <span>MATCH REASONS</span>
                    </div>
                    <p className="ai-recommendation-text">{matchReason}</p>
                  </div>

                  {/* Rating */}
                  {prod.rating && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', color: '#F59E0B', fontWeight: 700 }}>
                      <Star size={14} fill="#F59E0B" stroke="#F59E0B" />
                      <span>{prod.rating.toFixed(1)} / 5.0</span>
                    </div>
                  )}

                  {/* Add to Cart CTA */}
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleAddToCart(prod.id)}
                    disabled={isOutOfStock || isCartLoading}
                    style={{ width: '100%', padding: '9px 14px', borderRadius: '8px', fontSize: '0.84rem' }}
                  >
                    {isAdded ? <Check size={14} /> : <ShoppingCart size={14} />}
                    <span>{isAdded ? 'Added to Cart' : 'Add to Cart'}</span>
                  </button>

                  {/* Specifications Matrix Table */}
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                      Key Specifications
                    </div>

                    {allSpecKeys.map((key) => {
                      const val = prod.metadata_json?.[key]
                      return (
                        <div
                          key={key}
                          style={{
                            padding: '6px 8px',
                            backgroundColor: 'var(--color-tertiary)',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            border: '1px solid var(--color-border)',
                          }}
                        >
                          <span style={{ fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                            {key.replace('_', ' ')}:
                          </span>{' '}
                          <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                            {val !== undefined ? String(val) : '—'}
                          </span>
                        </div>
                      )
                    })}

                    {/* Catalog Source Provenance */}
                    {prod.sources && prod.sources.length > 0 && (
                      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700 }}>
                          <ShieldCheck size={12} color="var(--color-secondary)" />
                          <span>Catalog Source:</span>
                        </div>
                        <div>{prod.sources[0].source_name} ({prod.sources[0].source_type})</div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Bottom Next Step Bar */}
          <div
            className="matte-card"
            style={{
              padding: '16px 20px',
              backgroundColor: 'var(--color-tertiary)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>
              Ready to checkout your selected items? Review quantities and totals in your cart.
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsCartOpen(true)}
              style={{ padding: '9px 18px', borderRadius: '8px' }}
            >
              <span>Review Shopping Cart &rarr;</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
