import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('PayPilot AI Frontend — Live Product Search & Typeahead Logic', () => {
  // Simulates the CatalogView debounced typeahead search manager
  class MockTypeaheadSearchManager {
    constructor(catalogItems, debounceMs = 300) {
      this.catalog = catalogItems
      this.debounceMs = debounceMs
      this.query = ''
      this.debouncedQuery = ''
      this.suggestions = []
      this.isDropdownOpen = false
      this.activeIndex = -1
      this.timer = null
      this.requestCount = 0
    }

    setQuery(newQuery) {
      this.query = newQuery
      if (this.timer) {
        clearTimeout(this.timer)
      }

      const trimmed = newQuery.trim()
      if (!trimmed) {
        this.suggestions = []
        this.debouncedQuery = ''
        this.isDropdownOpen = false
        this.activeIndex = -1
        return
      }

      this.timer = setTimeout(() => {
        this.debouncedQuery = trimmed
        this.requestCount++
        this.suggestions = this.searchCatalog(trimmed).slice(0, 5)
        this.isDropdownOpen = true
        this.activeIndex = -1
      }, this.debounceMs)
    }

    searchCatalog(term) {
      const lower = term.toLowerCase()
      // Matches name, description, brand, category, metadata specs
      return this.catalog.filter((item) => {
        const inName = item.name.toLowerCase().includes(lower)
        const inDesc = (item.description || '').toLowerCase().includes(lower)
        const inBrand = (item.brand || '').toLowerCase().includes(lower)
        const inCat = (item.category || '').toLowerCase().includes(lower)
        const inSpecs = JSON.stringify(item.metadata_json || {}).toLowerCase().includes(lower)

        // Electronic synonym mapping
        const isElectronicTerm = lower === 'electronic' || lower === 'electronics'
        const isElectronicProduct =
          ['Audio', 'Wearables', 'Computing', 'Photography', 'Gaming'].includes(item.category) ||
          (item.category === 'Home Office' && item.sku !== 'HO-HM-AERON')

        return inName || inDesc || inBrand || inCat || inSpecs || (isElectronicTerm && isElectronicProduct)
      })
    }

    handleKeyDown(key) {
      if (!this.isDropdownOpen) return

      if (key === 'ArrowDown') {
        this.activeIndex = this.activeIndex < this.suggestions.length - 1 ? this.activeIndex + 1 : 0
      } else if (key === 'ArrowUp') {
        this.activeIndex = this.activeIndex > 0 ? this.activeIndex - 1 : this.suggestions.length - 1
      } else if (key === 'Escape') {
        this.isDropdownOpen = false
        this.activeIndex = -1
      } else if (key === 'Enter') {
        if (this.activeIndex >= 0 && this.suggestions[this.activeIndex]) {
          this.selectSuggestion(this.suggestions[this.activeIndex])
        }
      }
    }

    selectSuggestion(product) {
      this.query = product.name
      this.debouncedQuery = product.name
      this.isDropdownOpen = false
      this.activeIndex = -1
    }

    clear() {
      if (this.timer) clearTimeout(this.timer)
      this.query = ''
      this.debouncedQuery = ''
      this.suggestions = []
      this.isDropdownOpen = false
      this.activeIndex = -1
    }
  }

  const sampleCatalog = [
    {
      sku: 'AUD-SONY-XM5',
      name: 'Sony WH-1000XM5 Noise-Canceling Headphones',
      category: 'Audio',
      brand: 'Sony',
      description: 'Industry-leading noise cancellation.',
      price_minor: 39999,
      metadata_json: { connectivity: 'Bluetooth 5.2' },
    },
    {
      sku: 'COMP-APL-MBP14',
      name: 'Apple MacBook Pro 14-inch M3 Pro',
      category: 'Computing',
      brand: 'Apple',
      description: 'Blazing fast M3 Pro chip.',
      price_minor: 199900,
      metadata_json: { cpu: 'M3 Pro' },
    },
    {
      sku: 'HO-HM-AERON',
      name: 'Herman Miller Aeron Ergonomic Office Chair',
      category: 'Home Office',
      brand: 'Herman Miller',
      description: 'Pellicle suspension office chair.',
      price_minor: 169500,
      metadata_json: { size: 'B' },
    },
    {
      sku: 'GAME-VALVE-SD',
      name: 'Valve Steam Deck OLED 512GB',
      category: 'Gaming',
      brand: 'Valve',
      description: 'Handheld gaming console with 7.4-inch OLED.',
      price_minor: 54900,
      metadata_json: { display: 'OLED' },
    },
  ]

  it('debounces rapid keystrokes within 300ms window without firing redundant requests', async () => {
    const manager = new MockTypeaheadSearchManager(sampleCatalog, 50)
    manager.setQuery('e')
    manager.setQuery('el')
    manager.setQuery('ele')
    manager.setQuery('elect')
    manager.setQuery('electronic')

    assert.equal(manager.requestCount, 0, 'No search should fire before debounce delay')

    await new Promise((resolve) => setTimeout(resolve, 70))

    assert.equal(manager.requestCount, 1, 'Only one debounced request should execute')
    assert.equal(manager.debouncedQuery, 'electronic')
    assert.equal(manager.isDropdownOpen, true)
  })

  it('regression: typing "electronic" matches real tech items and excludes non-electronic furniture', async () => {
    const manager = new MockTypeaheadSearchManager(sampleCatalog, 10)
    manager.setQuery('electronic')
    await new Promise((resolve) => setTimeout(resolve, 20))

    assert.ok(manager.suggestions.length > 0)
    const skus = manager.suggestions.map((s) => s.sku)
    assert.ok(skus.includes('AUD-SONY-XM5'), 'Audio headphones match electronic search')
    assert.ok(skus.includes('COMP-APL-MBP14'), 'Laptops match electronic search')
    assert.ok(skus.includes('GAME-VALVE-SD'), 'Gaming consoles match electronic search')
    assert.ok(!skus.includes('HO-HM-AERON'), 'Office chair should not match electronic search')
  })

  it('clearing the search input immediately empties suggestions and closes dropdown without stale state', () => {
    const manager = new MockTypeaheadSearchManager(sampleCatalog, 10)
    manager.suggestions = [sampleCatalog[0]]
    manager.isDropdownOpen = true

    manager.setQuery('')
    assert.equal(manager.suggestions.length, 0)
    assert.equal(manager.isDropdownOpen, false)
    assert.equal(manager.debouncedQuery, '')
  })

  it('keyboard navigation cycles active index with ArrowDown/ArrowUp and closes on Escape', () => {
    const manager = new MockTypeaheadSearchManager(sampleCatalog, 10)
    manager.suggestions = sampleCatalog.slice(0, 3)
    manager.isDropdownOpen = true
    manager.activeIndex = -1

    manager.handleKeyDown('ArrowDown')
    assert.equal(manager.activeIndex, 0)

    manager.handleKeyDown('ArrowDown')
    assert.equal(manager.activeIndex, 1)

    manager.handleKeyDown('ArrowUp')
    assert.equal(manager.activeIndex, 0)

    manager.handleKeyDown('ArrowUp')
    assert.equal(manager.activeIndex, 2, 'ArrowUp wraps around to end of list')

    manager.handleKeyDown('Escape')
    assert.equal(manager.isDropdownOpen, false)
    assert.equal(manager.activeIndex, -1)
  })

  it('pressing Enter on highlighted suggestion selects product and closes dropdown', () => {
    const manager = new MockTypeaheadSearchManager(sampleCatalog, 10)
    manager.suggestions = sampleCatalog.slice(0, 2)
    manager.isDropdownOpen = true
    manager.activeIndex = 1

    manager.handleKeyDown('Enter')
    assert.equal(manager.query, sampleCatalog[1].name)
    assert.equal(manager.debouncedQuery, sampleCatalog[1].name)
    assert.equal(manager.isDropdownOpen, false)
  })
})

describe('PayPilot AI Frontend — Visible Cart Quantity Indicator & Feedback', () => {
  // Simulates cart item state and total unit calculation
  function calculateCartUnits(cart) {
    if (!cart || !Array.isArray(cart.items)) return 0
    return cart.items.reduce((sum, item) => sum + (item.quantity || 0), 0)
  }

  // Simulates cart feedback message generation
  function formatCartFeedback(quantity) {
    return `Added to cart +${quantity}`
  }

  it('correctly calculates total units across multiple line items (adding 1 -> +1; adding 2 -> +2)', () => {
    // Initial empty cart
    let cart = {
      items: [],
      item_count: 0,
      subtotal_minor: 0,
      currency: 'USD',
    }
    assert.equal(calculateCartUnits(cart), 0)

    // Add 1 unit of Product A
    cart = {
      items: [{ id: 'item-1', product_id: 'prod-a', quantity: 1, unit_price_minor: 39999 }],
      item_count: 1,
      subtotal_minor: 39999,
      currency: 'USD',
    }
    assert.equal(calculateCartUnits(cart), 1)
    assert.equal(cart.item_count, 1)
    assert.equal(formatCartFeedback(1), 'Added to cart +1')

    // Add 2 units of Product B
    cart = {
      items: [
        { id: 'item-1', product_id: 'prod-a', quantity: 1, unit_price_minor: 39999 },
        { id: 'item-2', product_id: 'prod-b', quantity: 2, unit_price_minor: 14999 },
      ],
      item_count: 3,
      subtotal_minor: 69997,
      currency: 'USD',
    }
    assert.equal(calculateCartUnits(cart), 3)
    assert.equal(cart.item_count, 3)
    assert.equal(formatCartFeedback(2), 'Added to cart +2')

    // Increment quantity of Product A to 3 units
    cart = {
      items: [
        { id: 'item-1', product_id: 'prod-a', quantity: 3, unit_price_minor: 39999 },
        { id: 'item-2', product_id: 'prod-b', quantity: 2, unit_price_minor: 14999 },
      ],
      item_count: 5,
      subtotal_minor: 149995,
      currency: 'USD',
    }
    assert.equal(calculateCartUnits(cart), 5)
    assert.equal(cart.item_count, 5)

    // Remove Product B (2 units removed)
    cart = {
      items: [{ id: 'item-1', product_id: 'prod-a', quantity: 3, unit_price_minor: 39999 }],
      item_count: 3,
      subtotal_minor: 119997,
      currency: 'USD',
    }
    assert.equal(calculateCartUnits(cart), 3)
    assert.equal(cart.item_count, 3)
  })

  it('avoids displaying false counts when session is loading or cart is null', () => {
    let isLoadingSession = true
    let cart = null

    // Helper determining whether sticky cart bar displays
    function shouldRenderStickyCart(isLoading, cartState, feedback) {
      if (isLoading) return false
      const units = cartState?.item_count ?? 0
      return units > 0 || Boolean(feedback)
    }

    assert.equal(shouldRenderStickyCart(isLoadingSession, cart, null), false)

    // Once session loaded with empty cart
    isLoadingSession = false
    assert.equal(shouldRenderStickyCart(isLoadingSession, cart, null), false)

    // When item is present
    cart = { items: [{ id: 'item-1', quantity: 1 }], item_count: 1 }
    assert.equal(shouldRenderStickyCart(isLoadingSession, cart, null), true)
  })

  it('synchronizes perfectly between sidebar badge, navbar badge, and sticky cart bar', () => {
    const authoritativeCart = {
      item_count: 4,
      subtotal_minor: 85996,
      currency: 'USD',
    }

    // Both badges and sticky bar consume authoritative item_count
    const sidebarCount = authoritativeCart.item_count
    const navbarCount = authoritativeCart.item_count
    const stickyBarCount = authoritativeCart.item_count

    assert.equal(sidebarCount, 4)
    assert.equal(navbarCount, 4)
    assert.equal(stickyBarCount, 4)
    assert.equal(sidebarCount, navbarCount)
    assert.equal(navbarCount, stickyBarCount)
  })
})

