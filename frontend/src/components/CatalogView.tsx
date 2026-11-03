import React, { useEffect, useState, useRef } from 'react'
import { Search, PackageSearch, RefreshCw, X, ChevronDown, Loader2, Scale } from 'lucide-react'
import type { ProductFilterParams, ProductItem } from '../api/types'
import { api } from '../api/client'
import { ProductCard } from './ProductCard'
import { useSession } from '../context/useSession'
import { formatCurrency } from '../utils/currency'
import { getProductImageUrl } from '../utils/productImages'

const CATEGORIES = ['All', 'Audio', 'Laptops', 'Keyboards', 'Monitors', 'Accessories']
const POPULAR_BRANDS = ['Sony', 'Bose', 'Sennheiser', 'Apple']

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

  // Filters & Search State
  const [searchQuery, setSearchQuery] = useState(initialQuery || '')
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery || '')
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || 'All')
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [minPrice, setMinPrice] = useState<string>('')
  const [maxPrice, setMaxPrice] = useState<string>('')
  const [minRating, setMinRating] = useState<number | null>(null)
  const [inStockOnly, setInStockOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'rating' | 'price_asc' | 'price_desc' | 'name'>('rating')
  const [page, setPage] = useState(1)

  // Fast typeahead suggestions state
  const [suggestions, setSuggestions] = useState<ProductItem[]>([])
  const [isTypeaheadLoading, setIsTypeaheadLoading] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const isTypingRef = useRef(false)

  // Applied trigger to fetch on button click or query change
  const [appliedFiltersTrigger, setAppliedFiltersTrigger] = useState(0)

  // Synchronize state when initialQuery or initialCategory props change without cascading renders
  const [prevInitialQuery, setPrevInitialQuery] = useState(initialQuery)
  if (initialQuery !== prevInitialQuery) {
    setPrevInitialQuery(initialQuery)
    setSearchQuery(initialQuery || '')
    setDebouncedQuery(initialQuery || '')
  }

  const [prevInitialCategory, setPrevInitialCategory] = useState(initialCategory)
  if (initialCategory !== prevInitialCategory) {
    setPrevInitialCategory(initialCategory)
    setSelectedCategory(initialCategory || 'All')
  }

  // Debounce live search typing (~300ms) to update grid without hammering the backend
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchQuery])

  // Click-outside listener to dismiss the typeahead dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fast catalog-grounded typeahead query as shopper types
  useEffect(() => {
    let ignore = false
    const runTypeahead = async () => {
      await Promise.resolve()
      if (ignore) return

      const trimmed = searchQuery.trim()
      if (!trimmed) {
        setSuggestions([])
        setIsTypeaheadLoading(false)
        setIsDropdownOpen(false)
        return
      }

      setIsTypeaheadLoading(true)
      try {
        const brandParam = selectedBrands.length === 1 ? selectedBrands[0] : undefined
        const minPriceMinor = minPrice ? Math.round(parseFloat(minPrice) * 100) : undefined
        const maxPriceMinor = maxPrice ? Math.round(parseFloat(maxPrice) * 100) : undefined

        const res = await api.listProducts({
          q: trimmed,
          category: selectedCategory === 'All' ? undefined : selectedCategory,
          brand: brandParam,
          min_price_minor: minPriceMinor,
          max_price_minor: maxPriceMinor,
          min_rating: minRating || undefined,
          in_stock_only: inStockOnly ? true : undefined,
          page: 1,
          page_size: 5,
        })
        if (!ignore) {
          let items = res.items
          if (selectedBrands.length > 0) {
            items = items.filter(
              (p) => !p.brand || selectedBrands.some((b) => b.toLowerCase() === p.brand?.toLowerCase())
            )
          }
          if (minRating) {
            items = items.filter((p) => (p.rating || 0) >= minRating)
          }
          setSuggestions(items)
          if (isTypingRef.current) {
            setIsDropdownOpen(true)
          }
          setActiveSuggestionIndex(-1)
        }
      } catch {
        if (!ignore) {
          setSuggestions([])
        }
      } finally {
        if (!ignore) {
          setIsTypeaheadLoading(false)
        }
      }
    }

    const timer = setTimeout(() => {
      runTypeahead()
    }, 280)

    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [searchQuery, selectedCategory, selectedBrands, minPrice, maxPrice, minRating, inStockOnly])

  // Catalog products grid query: reacts immediately to debouncedQuery and filters
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
          q: debouncedQuery.trim() || undefined,
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
    debouncedQuery,
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

  const handleClearSearch = () => {
    isTypingRef.current = false
    setSearchQuery('')
    setDebouncedQuery('')
    setSuggestions([])
    setIsDropdownOpen(false)
    setActiveSuggestionIndex(-1)
    setPage(1)
  }

  const handleSelectSuggestion = (prod: ProductItem) => {
    isTypingRef.current = false
    setSearchQuery(prod.name)
    setDebouncedQuery(prod.name)
    setIsDropdownOpen(false)
    setActiveSuggestionIndex(-1)
    setPage(1)

    // Smoothly scroll and highlight the selected product in the grid
    setTimeout(() => {
      const cardEl = document.getElementById(`product-card-${prod.id}`)
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        cardEl.classList.add('product-card-highlight')
        setTimeout(() => {
          cardEl.classList.remove('product-card-highlight')
        }, 2200)
      }
    }, 150)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isDropdownOpen && suggestions.length > 0) {
        setIsDropdownOpen(true)
        return
      }
      setActiveSuggestionIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSuggestionIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1))
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false)
      setActiveSuggestionIndex(-1)
    } else if (e.key === 'Enter') {
      if (isDropdownOpen && activeSuggestionIndex >= 0 && suggestions[activeSuggestionIndex]) {
        e.preventDefault()
        handleSelectSuggestion(suggestions[activeSuggestionIndex])
      } else {
        setIsDropdownOpen(false)
        handleApplyFilters()
      }
    }
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

        <div ref={searchContainerRef} className="typeahead-container">
          <Search
            size={15}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            type="text"
            className="input-text"
            placeholder="Search products, categories, specs..."
            value={searchQuery}
            onChange={(e) => {
              isTypingRef.current = true
              setSearchQuery(e.target.value)
            }}
            onFocus={() => {
              if (isTypingRef.current && suggestions.length > 0) setIsDropdownOpen(true)
            }}
            onKeyDown={handleSearchKeyDown}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isDropdownOpen}
            aria-controls="typeahead-suggestions-list"
            style={{ paddingLeft: '32px', paddingRight: '32px', fontSize: '0.85rem', width: '100%' }}
          />
          {isTypeaheadLoading ? (
            <Loader2
              size={14}
              className="spin-animation"
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-secondary)',
                pointerEvents: 'none',
              }}
            />
          ) : searchQuery ? (
            <button
              type="button"
              className="typeahead-clear-btn"
              onClick={handleClearSearch}
              aria-label="Clear search input"
            >
              <X size={14} />
            </button>
          ) : null}

          {/* Typeahead Suggestions Dropdown */}
          {isDropdownOpen && searchQuery.trim().length > 0 && (
            <div className="typeahead-dropdown" id="typeahead-suggestions-list" role="listbox">
              <div className="typeahead-header">
                <span>Matching Products ({suggestions.length})</span>
                {isTypeaheadLoading && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', textTransform: 'none' }}>
                    <Loader2 size={11} className="spin-animation" />
                    Searching...
                  </span>
                )}
              </div>

              {suggestions.length > 0 ? (
                <ul className="typeahead-list">
                  {suggestions.map((prod, idx) => (
                    <li
                      key={prod.id}
                      role="option"
                      aria-selected={activeSuggestionIndex === idx}
                      className={`typeahead-item ${activeSuggestionIndex === idx ? 'active' : ''}`}
                      onMouseEnter={() => setActiveSuggestionIndex(idx)}
                      onClick={() => handleSelectSuggestion(prod)}
                    >
                      <img
                        src={getProductImageUrl(prod.image_url, prod.name)}
                        alt={prod.name}
                        className="typeahead-item-img"
                      />
                      <div className="typeahead-item-info">
                        <div className="typeahead-item-name">{prod.name}</div>
                        <div className="typeahead-item-meta">
                          <span className="badge badge-purple" style={{ fontSize: '0.66rem', padding: '1px 6px' }}>
                            {prod.category}
                          </span>
                          {prod.brand && <span>&bull; {prod.brand}</span>}
                          <span>&bull;</span>
                          <span style={{ color: prod.stock_qty > 0 ? 'var(--color-success)' : 'var(--color-error)' }}>
                            {prod.stock_qty > 0 ? 'In Stock' : 'Out of Stock'}
                          </span>
                        </div>
                      </div>
                      <div className="typeahead-item-price">
                        {formatCurrency(prod.price_minor, prod.currency)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : !isTypeaheadLoading ? (
                <div className="typeahead-empty">
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>
                    No products match &ldquo;{searchQuery}&rdquo;
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.74rem' }}>
                    Try searching for &ldquo;electronic&rdquo;, &ldquo;headphones&rdquo;, or &ldquo;laptop&rdquo;
                  </p>
                </div>
              ) : null}
            </div>
          )}
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

