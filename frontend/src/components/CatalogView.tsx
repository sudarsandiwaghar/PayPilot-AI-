import React, { useEffect, useState } from 'react'
import { Search, PackageSearch, RefreshCw, X, ChevronDown } from 'lucide-react'
import type { ProductFilterParams, ProductItem } from '../api/types'
import { api } from '../api/client'
import { ProductCard } from './ProductCard'

const CATEGORIES = ['All', 'Audio', 'Laptops', 'Keyboards', 'Monitors', 'Accessories']
const POPULAR_BRANDS = ['Sony', 'Bose', 'Sennheiser', 'Apple']

import { useSession } from '../context/useSession'
import { Scale } from 'lucide-react'
import { formatCurrency } from '../utils/currency'

interface CatalogViewProps {
  initialQuery?: string
  initialCategory?: string
  onNavigateToCompare?: () => void
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  initialQuery,
  initialCategory,
  onNavigateToCompare,
}) => {
  const { comparisonIds } = useSession()
  const [products, setProducts] = useState<ProductItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters State
  const [searchQuery, setSearchQuery] = useState(initialQuery || '')
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || 'All')
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [minPrice, setMinPrice] = useState<string>('')
  const [maxPrice, setMaxPrice] = useState<string>('')
  const [minRating, setMinRating] = useState<number | null>(null)
  const [inStockOnly, setInStockOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'rating' | 'price_asc' | 'price_desc' | 'name'>('rating')
  const [page, setPage] = useState(1)

  // Applied trigger to fetch on button click or query change
  const [appliedFiltersTrigger, setAppliedFiltersTrigger] = useState(0)

  // Synchronize state when initialQuery or initialCategory props change without cascading renders
  const [prevInitialQuery, setPrevInitialQuery] = useState(initialQuery)
  if (initialQuery !== prevInitialQuery) {
    setPrevInitialQuery(initialQuery)
    setSearchQuery(initialQuery || '')
  }

  const [prevInitialCategory, setPrevInitialCategory] = useState(initialCategory)
  if (initialCategory !== prevInitialCategory) {
    setPrevInitialCategory(initialCategory)
    setSelectedCategory(initialCategory || 'All')
  }

  useEffect(() => {
    let ignore = false
    const load = async () => {
      await Promise.resolve()
      if (ignore) return
      setIsLoading(true)
      setError(null)
      try {
        const brandParam = selectedBrands.length === 1 ? selectedBrands[0] : undefined
        const minPriceMinor = minPrice ? Math.round(parseFloat(minPrice) * 100) : undefined
        const maxPriceMinor = maxPrice ? Math.round(parseFloat(maxPrice) * 100) : undefined

        const params: ProductFilterParams = {
          q: searchQuery.trim() || undefined,
          category: selectedCategory === 'All' ? undefined : selectedCategory,
          brand: brandParam,
          min_price_minor: minPriceMinor,
          max_price_minor: maxPriceMinor,
          min_rating: minRating || undefined,
          sort_by: sortBy,
          in_stock_only: inStockOnly ? true : undefined,
          page,
          page_size: 12,
        }
        const res = await api.listProducts(params)
        if (!ignore) {
          // If multiple brands are selected locally, apply client-side filtering if backend only supports single brand
          let items = res.items
          if (selectedBrands.length > 0) {
            items = items.filter(
              (p) => !p.brand || selectedBrands.some((b) => b.toLowerCase() === p.brand?.toLowerCase())
            )
          }
          if (minRating) {
            items = items.filter((p) => (p.rating || 0) >= minRating)
          }
          setProducts(items)
          setTotal(items.length)
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Failed to fetch catalog products')
        }
      } finally {
        if (!ignore) {
          setIsLoading(false)
        }
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [
    searchQuery,
    selectedCategory,
    sortBy,
    inStockOnly,
    page,
    appliedFiltersTrigger,
    selectedBrands,
    minPrice,
    maxPrice,
    minRating,
  ])

  const handleApplyFilters = () => {
    setPage(1)
    setAppliedFiltersTrigger((prev) => prev + 1)
  }

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    )
  }

  const removeBrandChip = (brand: string) => {
    setSelectedBrands((prev) => prev.filter((b) => b !== brand))
    setAppliedFiltersTrigger((prev) => prev + 1)
  }

  const removeMaxPriceChip = () => {
    setMaxPrice('')
    setAppliedFiltersTrigger((prev) => prev + 1)
  }

  return (
    <div className="catalog-layout">
      {/* Breadcrumb Header */}
      <div className="breadcrumb-row">
        <span>DASHBOARD</span>
        <span style={{ opacity: 0.6 }}>&gt;</span>
        <span style={{ color: 'var(--color-primary)' }}>PRODUCT CATALOG</span>
      </div>

      {/* Main Page Header */}
      <div>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--color-primary)', marginBottom: '4px' }}>
          Product Catalog
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}>
          {searchQuery ? (
            <>
              Filtering catalog for:{' '}
              <strong style={{ color: 'var(--color-primary)', fontStyle: 'italic' }}>
                &ldquo;{searchQuery}&rdquo;
              </strong>
            </>
          ) : (
            'Browse catalog products with category, price, and brand filters.'
          )}
        </p>
      </div>

      {/* Quick Category Buttons & Search Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: 'var(--color-secondary)',
          borderRadius: '12px',
          border: '1px solid var(--color-neutral)',
        }}
      >
        <div className="category-pills-row" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`category-tab-btn ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => {
                setSelectedCategory(cat)
                setPage(1)
                setAppliedFiltersTrigger((p) => p + 1)
              }}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.82rem',
                fontWeight: 600,
                border: '1px solid var(--color-border)',
                backgroundColor: selectedCategory === cat ? 'var(--color-secondary)' : 'var(--color-neutral)',
                color: selectedCategory === cat ? 'var(--color-neutral)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: '220px', maxWidth: '360px', position: 'relative' }}>
          <Search
            size={15}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            className="input-text"
            placeholder="Refine search query..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApplyFilters()
            }}
            style={{ paddingLeft: '32px', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {/* Two Column Layout: Left Filter Panel + Right Results Grid */}
      <div className="catalog-columns-container">
        {/* Left Filter Sidebar Panel (Soft Purple #F4F0FA) */}
        <aside className="filter-sidebar-panel">
          <div className="filter-section-title">FILTERS</div>

          {/* Price Range */}
          <div className="filter-group">
            <span className="filter-group-label">Price Range</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <input
                type="number"
                placeholder="Min"
                className="input-text"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                style={{ padding: '6px 8px', fontSize: '0.82rem' }}
              />
              <input
                type="number"
                placeholder="Max"
                className="input-text"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                style={{ padding: '6px 8px', fontSize: '0.82rem' }}
              />
            </div>
          </div>

          {/* Brand Checkboxes */}
          <div className="filter-group">
            <span className="filter-group-label">Brand</span>
            {POPULAR_BRANDS.map((b) => (
              <label key={b} className="filter-checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedBrands.includes(b)}
                  onChange={() => toggleBrand(b)}
                />
                <span>{b}</span>
              </label>
            ))}
          </div>

          {/* Rating Radios */}
          <div className="filter-group">
            <span className="filter-group-label">Rating</span>
            <label className="filter-checkbox-label">
              <input
                type="radio"
                name="rating"
                checked={minRating === 4.5}
                onChange={() => setMinRating(4.5)}
              />
              <span>4.5 &amp; Up</span>
            </label>
            <label className="filter-checkbox-label">
              <input
                type="radio"
                name="rating"
                checked={minRating === 4.0}
                onChange={() => setMinRating(4.0)}
              />
              <span>4.0 &amp; Up</span>
            </label>
            <label className="filter-checkbox-label">
              <input
                type="radio"
                name="rating"
                checked={minRating === null}
                onChange={() => setMinRating(null)}
              />
              <span>All Ratings</span>
            </label>
          </div>

          {/* Availability */}
          <div className="filter-group">
            <span className="filter-group-label">Availability</span>
            <label className="filter-checkbox-label">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
              />
              <span>In Stock Only</span>
            </label>
          </div>

          {/* Apply Filters Primary Button */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleApplyFilters}
            style={{ width: '100%', marginTop: '6px', padding: '10px 14px', borderRadius: '8px' }}
          >
            Apply Filters
          </button>
        </aside>

        {/* Right Column: Results Bar & Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Top Result Controls Bar */}
          <div className="catalog-top-bar">
            {/* Left: Result Count & Active Filter Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                {total || products.length} Results Found
              </span>

              <div className="active-filter-chips">
                {selectedBrands.map((b) => (
                  <span key={b} className="filter-chip-tag">
                    <span>{b}</span>
                    <button
                      type="button"
                      onClick={() => removeBrandChip(b)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}

                {maxPrice && (
                  <span className="filter-chip-tag">
                    <span>UNDER {formatCurrency(parseInt(maxPrice, 10) * 100, 'USD')}</span>
                    <button
                      type="button"
                      onClick={removeMaxPriceChip}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
                    >
                      <X size={11} />
                    </button>
                  </span>
                )}
              </div>
            </div>

            {/* Right: Sort Dropdown & Refresh */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Sort by:</span>
              <div style={{ position: 'relative' }}>
                <select
                  className="select-input"
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as 'rating' | 'price_asc' | 'price_desc' | 'name')
                    setAppliedFiltersTrigger((p) => p + 1)
                  }}
                  style={{
                    paddingRight: '28px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    appearance: 'none',
                    backgroundColor: 'var(--color-white)',
                  }}
                >
                  <option value="rating">AI Relevance</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="name">Product Name</option>
                </select>
                <ChevronDown
                  size={14}
                  color="var(--text-muted)"
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                />
              </div>

              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setAppliedFiltersTrigger((prev) => prev + 1)}
                style={{ padding: '8px 10px' }}
                title="Refresh product list"
              >
                <RefreshCw size={13} className={isLoading ? 'spin-animation' : ''} />
              </button>
            </div>
          </div>

          {/* Comparison Queued Notice Bar */}
          {comparisonIds.length > 0 && onNavigateToCompare && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderRadius: '8px',
                backgroundColor: 'var(--color-primary)',
                color: 'white',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.86rem' }}>
                <Scale size={16} />
                <span>
                  <strong>{comparisonIds.length}</strong> product{comparisonIds.length > 1 ? 's' : ''} queued for comparison (up to 4)
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onNavigateToCompare}
                style={{ padding: '5px 12px', fontSize: '0.8rem', borderRadius: '6px' }}
              >
                Compare Models &rarr;
              </button>
            </div>
          )}

          {/* Loading Skeleton */}
          {isLoading ? (
            <div className="product-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} className="matte-card" style={{ height: '420px', opacity: 0.6, padding: '16px' }}>
                  <div style={{ height: '180px', backgroundColor: 'var(--color-secondary)', borderRadius: '10px', marginBottom: '14px' }} />
                  <div style={{ height: '18px', width: '70%', backgroundColor: 'var(--color-secondary)', borderRadius: '4px', marginBottom: '10px' }} />
                  <div style={{ height: '14px', width: '40%', backgroundColor: 'var(--color-secondary)', borderRadius: '4px' }} />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            /* Empty State */
            <div className="purple-surface-panel" style={{ textAlign: 'center', padding: '60px 20px', borderRadius: '14px' }}>
              <PackageSearch size={44} color="var(--color-primary)" style={{ margin: '0 auto 16px', opacity: 0.8 }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px', color: 'var(--color-primary)' }}>
                No products match your criteria
              </h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 20px', fontSize: '0.88rem' }}>
                Try resetting your price filters or brand selections to view all catalog products.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedCategory('All')
                  setSelectedBrands([])
                  setMinPrice('')
                  setMaxPrice('')
                  setMinRating(null)
                  setInStockOnly(false)
                  setAppliedFiltersTrigger((p) => p + 1)
                }}
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            /* Product Cards Grid (Matches Reference Pure White Cards) */
            <div className="product-grid">
              {products.map((prod, index) => (
                <ProductCard
                  key={prod.id}
                  product={prod}
                  badgeType={index === 0 ? 'best_match' : index === 1 ? 'best_price' : null}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

