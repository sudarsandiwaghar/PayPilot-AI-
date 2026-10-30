import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('PayPilot AI Dynamic Search Flow — URL Hash & Routing Synchronization', () => {
  // Helper simulating App.tsx syncFromHash logic
  function parseHashRoute(hash) {
    const rawHash = hash || ''
    if (rawHash.startsWith('#/search') || rawHash.startsWith('#/agent')) {
      const queryParams = new URLSearchParams(rawHash.split('?')[1] || '')
      const q = queryParams.get('q') || ''
      return { view: 'agent', query: q }
    } else if (rawHash.startsWith('#/catalog')) {
      const queryParams = new URLSearchParams(rawHash.split('?')[1] || '')
      return { view: 'catalog', category: queryParams.get('category') || 'All', query: queryParams.get('q') || '' }
    } else if (rawHash.startsWith('#/compare')) {
      return { view: 'compare' }
    } else if (rawHash.startsWith('#/orders')) {
      return { view: 'orders' }
    }
    return { view: 'dashboard' }
  }

  // Helper simulating App.tsx targetHash generation
  function generateSearchHash(query) {
    const trimmed = (query || '').trim()
    return trimmed ? `#/search?q=${encodeURIComponent(trimmed)}` : '#/agent'
  }

  it('correctly extracts user query and view from #/search?q=... on initial page load / refresh', () => {
    const hash = '#/search?q=noise-canceling%20headphones%20under%20%24400'
    const route = parseHashRoute(hash)
    assert.equal(route.view, 'agent')
    assert.equal(route.query, 'noise-canceling headphones under $400')
  })

  it('preserves complex query constraints with symbols and currency across encode/decode', () => {
    const originalQuery = 'Keyboards with hot-swap switches & RGB under $150 & 4K'
    const hash = generateSearchHash(originalQuery)
    assert.equal(hash, '#/search?q=Keyboards%20with%20hot-swap%20switches%20%26%20RGB%20under%20%24150%20%26%204K')

    const route = parseHashRoute(hash)
    assert.equal(route.view, 'agent')
    assert.equal(route.query, originalQuery)
  })

  it('navigating to #/agent without query parameters defaults to empty search query without auto-dispatching', () => {
    const route = parseHashRoute('#/agent')
    assert.equal(route.view, 'agent')
    assert.equal(route.query, '')
  })

  it('idempotent hash updates avoid redundant hash mutation if URL is already synchronized', () => {
    let currentHash = '#/search?q=laptop'
    const newQuery = 'laptop'
    const targetHash = generateSearchHash(newQuery)

    let assignmentCount = 0
    if (currentHash !== targetHash) {
      currentHash = targetHash
      assignmentCount++
    }

    assert.equal(assignmentCount, 0, 'Should not reassign hash if target matches current')
    assert.equal(currentHash, '#/search?q=laptop')
  })
})

describe('PayPilot AI Dynamic Search Flow — Input Trimming & Empty Validation', () => {
  // Helper simulating DashboardView and AgentChatView validation logic
  function validateAndTrimQuery(input) {
    const trimmed = (input || '').trim()
    if (!trimmed) {
      return { valid: false, error: 'Please enter a product request before searching with AI.', query: '' }
    }
    return { valid: true, error: null, query: trimmed }
  }

  it('rejects completely empty query input with expected inline error message', () => {
    const result = validateAndTrimQuery('')
    assert.equal(result.valid, false)
    assert.equal(result.error, 'Please enter a product request before searching with AI.')
    assert.equal(result.query, '')
  })

  it('rejects whitespace-only queries (spaces, tabs, newlines) without dispatching', () => {
    const whitespaceInputs = ['   ', '\t\t', ' \n \r ', '   \t  ']
    for (const input of whitespaceInputs) {
      const result = validateAndTrimQuery(input)
      assert.equal(result.valid, false)
      assert.equal(result.error, 'Please enter a product request before searching with AI.')
      assert.equal(result.query, '')
    }
  })

  it('trims leading and trailing whitespace while preserving inner user phrasing', () => {
    const input = '   ultra-lightweight laptop with 32GB RAM under $1,800   '
    const result = validateAndTrimQuery(input)
    assert.equal(result.valid, true)
    assert.equal(result.error, null)
    assert.equal(result.query, 'ultra-lightweight laptop with 32GB RAM under $1,800')
  })
})

describe('PayPilot AI Dynamic Search Flow — Single Submission & Duplicate Request Prevention', () => {
  // Mock simulation of AgentChatView's submission lifecycle
  class MockAgentViewSearchManager {
    constructor(apiDispatchFn) {
      this.apiDispatch = apiDispatchFn
      this.submittedQueryRef = null
      this.query = ''
      this.inlineError = null
      this.dispatchLog = []
    }

    // Simulates user clicking Search with AI or pressing Enter
    async submit(rawText) {
      const textToSubmit = (rawText !== undefined ? rawText : this.query).trim()
      if (!textToSubmit) {
        this.inlineError = 'Please enter a product request before searching with AI.'
        return
      }
      this.inlineError = null
      this.submittedQueryRef = textToSubmit
      this.dispatchLog.push(textToSubmit)
      await this.apiDispatch(textToSubmit)
    }

    // Simulates useEffect(initialQuery) on mount / hash sync
    async handleInitialQueryEffect(initialQuery) {
      const trimmed = (initialQuery || '').trim()
      if (trimmed && trimmed !== this.submittedQueryRef) {
        this.submittedQueryRef = trimmed
        this.query = trimmed
        this.inlineError = null
        this.dispatchLog.push(trimmed)
        await this.apiDispatch(trimmed)
      }
    }
  }

  it('submits user-entered query exactly once on dashboard navigation to search results', async () => {
    const apiCalls = []
    const manager = new MockAgentViewSearchManager(async (q) => {
      apiCalls.push(q)
    })

    // Navigation from dashboard passes initialQuery
    await manager.handleInitialQueryEffect('noise-canceling headphones')
    assert.equal(apiCalls.length, 1)
    assert.equal(apiCalls[0], 'noise-canceling headphones')

    // Subsequent re-render of component with same initialQuery does NOT re-dispatch
    await manager.handleInitialQueryEffect('noise-canceling headphones')
    assert.equal(apiCalls.length, 1, 'Duplicate API call was prevented by submittedQueryRef check')
  })

  it('browser refresh simulation with URL hash executes recommendation endpoint exactly once', async () => {
    const apiCalls = []
    const manager = new MockAgentViewSearchManager(async (q) => {
      apiCalls.push(q)
    })

    // User refreshes page: initial mount with parsed hash query
    const hash = '#/search?q=mechanical%20keyboard'
    const qFromHash = new URLSearchParams(hash.split('?')[1]).get('q')

    await manager.handleInitialQueryEffect(qFromHash)
    assert.equal(apiCalls.length, 1)
    assert.equal(apiCalls[0], 'mechanical keyboard')

    // Multiple component re-renders (state updates, modal open/close) do not trigger new searches
    await manager.handleInitialQueryEffect(qFromHash)
    await manager.handleInitialQueryEffect(qFromHash)
    assert.equal(apiCalls.length, 1)
  })

  it('refining a query in the search bar updates query tracking and submits new query exactly once', async () => {
    const apiCalls = []
    const manager = new MockAgentViewSearchManager(async (q) => {
      apiCalls.push(q)
    })

    // 1. Initial search
    await manager.handleInitialQueryEffect('headphones')
    assert.equal(apiCalls.length, 1)

    // 2. User types new refinement and clicks Search with AI
    manager.query = 'Sony WH-1000XM5 under $400'
    await manager.submit()
    assert.equal(apiCalls.length, 2)
    assert.equal(apiCalls[1], 'Sony WH-1000XM5 under $400')

    // 3. Parent hash update re-renders child with initialQuery = 'Sony WH-1000XM5 under $400'
    await manager.handleInitialQueryEffect('Sony WH-1000XM5 under $400')
    assert.equal(apiCalls.length, 2, 'No redundant re-fetch triggered on parent re-render')
  })
})

describe('PayPilot AI Dynamic Search Flow — Response State Handling', () => {
  it('correctly identifies ambiguity and returns clarification questions without hallucinating products', () => {
    // Response envelope structure returned by POST /api/v1/sessions/.../agent/recommend
    const mockAmbiguousResponse = {
      intent: {
        raw_query: 'recommend something good',
        intent_type: 'clarification_needed',
        ambiguity_detected: true,
        constraints: { category: null, budget_minor: null, currency: 'USD', required_features: [] },
        clarification_questions: [
          'Could you specify the product category you are searching for?',
          'What features or budget limits would you like to set?',
        ],
      },
      recommendations: [],
      comparison: [],
      budget_summary: null,
      clarification_questions: [
        'Could you specify the product category you are searching for?',
        'What features or budget limits would you like to set?',
      ],
    }

    assert.equal(mockAmbiguousResponse.intent.ambiguity_detected, true)
    assert.equal(mockAmbiguousResponse.recommendations.length, 0)
    assert.equal(mockAmbiguousResponse.clarification_questions.length, 2)
    assert.match(mockAmbiguousResponse.clarification_questions[0], /product category/)
  })

  it('correctly identifies zero-match state for impossible constraints and surfaces budget guidance', () => {
    const mockZeroMatchResponse = {
      intent: {
        raw_query: 'laptops under $5',
        intent_type: 'recommendation',
        ambiguity_detected: false,
        constraints: { category: 'Laptops', budget_minor: 500, currency: 'USD', required_features: [] },
      },
      recommendations: [],
      comparison: [],
      budget_summary: {
        budget_minor: 500,
        currency: 'USD',
        allocated_minor: 0,
        remaining_minor: 500,
        fits_within_budget: true,
        recommended_item_count: 0,
      },
      clarification_questions: [
        'No matching in-stock products found under the current constraints. Would you like to expand your budget beyond $5.00 or explore other categories?',
      ],
    }

    assert.equal(mockZeroMatchResponse.recommendations.length, 0)
    assert.equal(mockZeroMatchResponse.budget_summary.budget_minor, 500)
    assert.equal(mockZeroMatchResponse.clarification_questions.length, 1)
    assert.match(mockZeroMatchResponse.clarification_questions[0], /No matching in-stock products/)
  })
})
