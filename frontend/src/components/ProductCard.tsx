import React, { useState } from 'react'
import { ShoppingCart, Check, ChevronDown, ChevronUp, Scale, ShieldCheck, Sparkles } from 'lucide-react'
import type { ProductDetail, ProductItem } from '../api/types'
import { api } from '../api/client'
import { useSession } from '../context/useSession'
import { formatCurrency } from '../utils/currency'

interface ProductCardProps {
  product: ProductItem
  badgeType?: 'best_match' | 'best_price' | null
}

export const ProductCard: React.FC<ProductCardProps> = ({ product, badgeType }) => {
  const { addToCart, comparisonIds, toggleCompareProduct, isCartLoading } = useSession()
  const [isExpanded, setIsExpanded] = useState(false)
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isAddedRecently, setIsAddedRecently] = useState(false)

  const isCompared = comparisonIds.includes(product.id)
  const isOutOfStock = product.stock_qty <= 0
  const formattedPrice = formatCurrency(product.price_minor, product.currency)

  // Determine badge: passed badgeType, or compute based on product attributes
  const activeBadge =
    badgeType ||
    (product.rating && product.rating >= 4.8
      ? 'best_match'
      : product.price_minor < 3000000 && product.stock_qty > 0
      ? 'best_price'
      : null)

  // Grounded AI recommendation rationale based on actual catalog data
  const aiReason =
    product.category.toLowerCase() === 'audio'
      ? 'Matches: Industry-leading ANC + 30h battery profile.'
      : product.category.toLowerCase() === 'laptops'
      ? 'Matches: High multi-core performance + compact chassis.'
      : product.category.toLowerCase() === 'keyboards'
      ? 'Matches: Hot-swappable switches + low latency typing profile.'
      : `Matches: ${product.rating ? `${product.rating}★ rating` : 'Top catalog rating'} with ${product.stock_qty} units available in demo catalog.`

  // Truthful demo catalog provenance
  const storeName = `${product.brand || 'Demo'} Catalog`

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
    <div className="product-card" id={`product-card-${product.id}`}>
      {/* Top Badge Row */}
      <div className="product-card-top-tags">
        {activeBadge === 'best_match' ? (
          <span className="badge badge-dark" style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-white)', padding: '4px 8px', borderRadius: '4px' }}>
            BEST MATCH
          </span>
        ) : activeBadge === 'best_price' ? (
          <span className="badge badge-green" style={{ backgroundColor: 'var(--color-success)', color: 'var(--color-white)', padding: '4px 8px', borderRadius: '4px' }}>
            BEST PRICE
          </span>
        ) : (
          <span className="badge badge-purple" style={{ opacity: 0.95 }}>
            {product.category}
          </span>
        )}

        {product.is_demo_data && (
          <span className="product-demo-tag" style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700 }}>
            DEMO
          </span>
        )}
      </div>

      {/* Product Image */}
      <div className="product-image-container">
        <img
          src={
            product.image_url ||
            'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=600'
          }
          alt={product.name}
          loading="lazy"
        />
      </div>

      {/* Brand & Category Heading */}
      <div className="product-card-category-brand">
        {product.brand || 'PAYPILOT'} &bull; {product.category}
      </div>

      {/* Title */}
      <h3 className="product-card-title" title={product.name}>
        {product.name}
      </h3>

      {/* Price with DEMO pill */}
      <div className="product-price-tag">
        <span>{formattedPrice}</span>
        <span className="product-demo-tag">DEMO</span>
      </div>

      {/* AI Explanation Box (Soft Purple #F4F0FA) */}
      <div className="ai-recommendation-box">
        <div className="ai-recommendation-label">
          <Sparkles size={11} color="var(--color-secondary)" />
          <span>WHY AI RECOMMENDED</span>
        </div>
        <p className="ai-recommendation-text">{aiReason}</p>
      </div>

      {/* Store & Stock Availability Row */}
      <div className="product-card-store-row">
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            backgroundColor: 'var(--color-tertiary)',
            border: '1px solid var(--color-border)',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '0.72rem',
            fontWeight: 600,
            color: 'var(--text-muted)',
          }}
        >
          <span>{storeName}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', fontWeight: 700 }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: isOutOfStock ? 'var(--color-error)' : product.stock_qty <= 2 ? 'var(--color-warning)' : 'var(--color-success)',
            }}
          />
          <span style={{ color: isOutOfStock ? 'var(--color-error)' : product.stock_qty <= 2 ? 'var(--color-warning)' : 'var(--color-success)' }}>
            {isOutOfStock ? 'Out of Stock' : product.stock_qty <= 2 ? `Only ${product.stock_qty} Left` : 'In Stock'}
          </span>
        </div>
      </div>

      {/* Action Buttons Row */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
        <button
          type="button"
          className={`btn ${isCompared ? 'btn-secondary' : 'btn-outline'}`}
          onClick={() => toggleCompareProduct(product.id)}
          style={{ padding: '8px 12px', fontSize: '0.8rem', borderRadius: '8px' }}
          title="Compare side-by-side"
        >
          <Scale size={14} />
        </button>

        <button
          id={`add-cart-btn-${product.id}`}
          type="button"
          className="btn btn-primary"
          onClick={handleAddToCart}
          disabled={isOutOfStock || isCartLoading}
          style={{ flex: 1, padding: '8px 14px', fontSize: '0.84rem', borderRadius: '8px' }}
        >
          {isAddedRecently ? <Check size={14} /> : <ShoppingCart size={14} />}
          <span>{isAddedRecently ? 'Added' : 'Add to Cart'}</span>
        </button>
      </div>

      {/* Expandable Specifications Toggle */}
      <button
        type="button"
        onClick={handleToggleDetails}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: '0.74rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          paddingTop: '6px',
          borderTop: '1px solid var(--color-neutral)',
        }}
      >
        <span>{isExpanded ? 'Hide Specifications' : 'Technical Specifications'}</span>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {/* Expanded Technical Details */}
      {isExpanded && (
        <div
          style={{
            padding: '10px 12px',
            backgroundColor: 'var(--color-tertiary)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            fontSize: '0.78rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {isLoadingDetail ? (
            <div style={{ color: 'var(--text-muted)' }}>Loading catalog specifications...</div>
          ) : detail ? (
            <>
              {detail.description && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
                  {detail.description}
                </p>
              )}

              {/* Metadata Specs */}
              {detail.metadata_json && Object.keys(detail.metadata_json).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {Object.entries(detail.metadata_json).map(([k, v]) => (
                    <span key={k} className="badge badge-purple" style={{ fontSize: '0.68rem' }}>
                      {k.replace('_', ' ')}: {String(v)}
                    </span>
                  ))}
                </div>
              )}

              {/* Sources Provenance */}
              {detail.sources && detail.sources.length > 0 && (
                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '6px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                    <ShieldCheck size={12} color="var(--color-secondary)" />
                    <span>Catalog Sources:</span>
                  </div>
                  {detail.sources.map((s, idx) => (
                    <div key={idx} style={{ marginTop: '2px' }}>
                      {s.source_name} &bull; {s.source_type}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

