import React, { useEffect, useState } from 'react'
import { Search, SlidersHorizontal, PackageSearch, RefreshCw } from 'lucide-react'
import type { ProductFilterParams, ProductItem } from '../api/types'
import { api } from '../api/client'
import { ProductCard } from './ProductCard'

const CATEGORIES = ['All', 'Audio', 'Laptops', 'Keyboards', 'Monitors', 'Accessories']

export const CatalogView: React.FC = () => {
  const [products, setProducts] = useState<ProductItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [sortBy, setSortBy] = useState<'rating' | 'price_asc' | 'price_desc' | 'name'>('rating')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [page, setPage] = useState(1)

  const [reloadTrigger, setReloadTrigger] = useState(0)

  useEffect(() => {
    let ignore = false
    const load = async () => {
      await Promise.resolve()
      if (ignore) return
      setIsLoading(true)
      setError(null)
      try {
        const params: ProductFilterParams = {
          q: searchQuery.trim() || undefined,
          category: selectedCategory === 'All' ? undefined : selectedCategory,
          sort_by: sortBy,
          in_stock_only: inStockOnly ? true : undefined,
          page,
          page_size: 12,
        }
        const res = await api.listProducts(params)
        if (!ignore) {
          setProducts(res.items)
          setTotal(res.total)
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
  }, [searchQuery, selectedCategory, sortBy, inStockOnly, page, reloadTrigger])

  return (
    <div>
      {/* Filters and Controls */}
      <div className="glass-panel filter-bar">
        {/* Search */}
        <div className="search-input-wrap">
          <Search size={18} />
          <input
            type="text"
            className="search-input"
            placeholder="Search headphones, laptops, mechanical keyboards..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setPage(1)
            }}
          />
        </div>

        {/* Category Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SlidersHorizontal size={16} color="var(--text-subtle)" />
          <select
            className="select-filter"
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value)
              setPage(1)
            }}
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                Category: {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <select
          className="select-filter"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'rating' | 'price_asc' | 'price_desc' | 'name')}
        >
          <option value="rating">Sort: Highest Rating</option>
          <option value="price_asc">Sort: Price Low to High</option>
          <option value="price_desc">Sort: Price High to Low</option>
          <option value="name">Sort: Product Name</option>
        </select>

        {/* In-Stock Toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85rem',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => {
              setInStockOnly(e.target.checked)
              setPage(1)
            }}
            style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
          />
          <span>In Stock Only</span>
        </label>

        {/* Refresh */}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setReloadTrigger((prev) => prev + 1)}
          style={{ padding: '8px 12px' }}
          title="Refresh products"
        >
          <RefreshCw size={15} className={isLoading ? 'spin-anim' : ''} />
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: '20px' }}>
          <span>{error}</span>
        </div>
      )}

      {/* Total count bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Showing <strong>{products.length}</strong> of <strong>{total}</strong> verified products
        </span>
      </div>

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="products-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass-panel" style={{ height: '360px', opacity: 0.5, padding: '20px' }}>
              <div style={{ height: '180px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', marginBottom: '16px' }} />
              <div style={{ height: '20px', width: '70%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', marginBottom: '10px' }} />
              <div style={{ height: '16px', width: '40%', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        /* Empty State */
        <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <PackageSearch size={48} color="var(--text-subtle)" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: '1.25rem', marginBottom: '8px' }}>No products match your criteria</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 20px' }}>
            Try expanding your price range, clearing specific filters, or asking the AI Shopping Assistant for smart recommendations.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSearchQuery('')
              setSelectedCategory('All')
              setInStockOnly(false)
            }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        /* Products Grid */
        <div className="products-grid">
          {products.map((prod) => (
            <ProductCard key={prod.id} product={prod} />
          ))}
        </div>
      )}
    </div>
  )
}
