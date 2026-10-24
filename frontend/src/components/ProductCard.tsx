import React, { useState } from 'react'
import { Star, ShoppingCart, Plus, Check, ChevronDown, ChevronUp, ExternalLink, ShieldCheck } from 'lucide-react'
import type { ProductDetail, ProductItem } from '../api/types'
import { api } from '../api/client'
import { useSession } from '../context/useSession'
import { formatCurrency } from '../utils/currency'

interface ProductCardProps {
  product: ProductItem
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { addToCart, comparisonIds, toggleCompareProduct, isCartLoading } = useSession()
  const [isExpanded, setIsExpanded] = useState(false)
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isAddedRecently, setIsAddedRecently] = useState(false)

  const isCompared = comparisonIds.includes(product.id)
  const isOutOfStock = product.stock_qty <= 0
  const formattedPrice = formatCurrency(product.price_minor, product.currency)

  const handleToggleDetails = async () => {
    if (!isExpanded && !detail) {
      try {
        setIsLoadingDetail(true)
        const full = await api.getProduct(product.id)
        setDetail(full)
      } catch (err) {
        console.error('Failed to load product details', err)
      } finally {
        setIsLoadingDetail(false)
      }
    }
    setIsExpanded((prev) => !prev)
  }

  const handleAddToCart = async () => {
    const success = await addToCart(product.id, 1)
    if (success) {
      setIsAddedRecently(true)
      setTimeout(() => setIsAddedRecently(false), 2000)
    }
  }

  return (
    <div className="glass-panel product-card">
      {/* Product Image */}
      <div className="product-img-wrap">
        <img
          src={
            product.image_url ||
            'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600'
          }
          alt={product.name}
          className="product-img"
          loading="lazy"
        />
        <span className="card-category-badge">{product.category}</span>
        {product.is_demo_data && <span className="card-demo-badge">Demo Data</span>}
      </div>

      {/* Info */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span className="product-brand">{product.brand || 'PayPilot'}</span>
        {product.rating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#fbbf24' }}>
            <Star size={13} fill="#fbbf24" stroke="#fbbf24" />
            <span>{product.rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      <h3 className="product-title" title={product.name}>
        {product.name}
      </h3>

      {/* Price & Stock */}
      <div className="product-meta-row">
        <div>
          <div className="product-price">{formattedPrice}</div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>SKU: {product.sku}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          {isOutOfStock ? (
            <span className="stock-tag out">Out of stock</span>
          ) : product.stock_qty < 10 ? (
            <span className="stock-tag low">Only {product.stock_qty} left</span>
          ) : (
            <span className="stock-tag">{product.stock_qty} in stock</span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="card-btn-row">
        <button
          type="button"
          className={`btn ${isAddedRecently ? 'btn-secondary' : 'btn-primary'}`}
          style={{ flex: 1 }}
          onClick={handleAddToCart}
          disabled={isOutOfStock || isCartLoading}
        >
          {isAddedRecently ? (
            <>
              <Check size={16} />
              <span>Added!</span>
            </>
          ) : (
            <>
              <ShoppingCart size={16} />
              <span>Add to Cart</span>
            </>
          )}
        </button>

        <button
          type="button"
          className={`btn ${isCompared ? 'btn-secondary' : 'btn-outline'}`}
          style={{ padding: '8px 12px' }}
          onClick={() => toggleCompareProduct(product.id)}
          title={isCompared ? 'Remove from compare' : 'Add to compare'}
        >
          {isCompared ? <Check size={15} color="#10b981" /> : <Plus size={15} />}
        </button>
      </div>

      {/* Accordion toggle for Specifications & Evidence */}
      <button
        type="button"
        onClick={handleToggleDetails}
        style={{
          marginTop: '10px',
          background: 'none',
          border: 'none',
          color: 'var(--text-accent)',
          fontSize: '0.78rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          padding: '4px 0',
        }}
      >
        <span>{isExpanded ? 'Hide Specs & Evidence' : 'View Specs & Sources'}</span>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Accordion Content */}
      {isExpanded && (
        <div
          style={{
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
          }}
        >
          {isLoadingDetail ? (
            <div style={{ textAlign: 'center', padding: '10px' }}>Loading specifications...</div>
          ) : (
            <>
              {detail?.description && (
                <p style={{ marginBottom: '8px', lineHeight: '1.4' }}>{detail.description}</p>
              )}

              {/* Specs metadata */}
              {detail?.metadata_json && Object.keys(detail.metadata_json).length > 0 && (
                <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '8px', borderRadius: '6px', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px', fontSize: '0.75rem' }}>
                    Specifications:
                  </div>
                  {Object.entries(detail.metadata_json).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                      <span style={{ textTransform: 'capitalize' }}>{key.replace('_', ' ')}:</span>
                      <span style={{ color: 'var(--text-main)' }}>{String(val)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Source Evidence */}
              {detail?.sources && detail.sources.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldCheck size={13} color="#10b981" />
                    <span>Catalog Evidence & Claims:</span>
                  </div>
                  {detail.sources.map((s, idx) => (
                    <div
                      key={`${s.source_name}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.72rem',
                        padding: '4px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}
                    >
                      <span>
                        {s.source_name} ({s.source_type})
                      </span>
                      {s.source_url && (
                        <a
                          href={s.source_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--accent-cyan)', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                        >
                          Verify <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
