import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Sparkles,
  Search,
  HelpCircle,
  ShieldCheck,
  ShoppingCart,
  Check,
  AlertTriangle,
  Scale,
  DollarSign,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'
import type { ShoppingAgentResponse } from '../api/types'
import { api, ApiErrorResponse } from '../api/client'
import { useSession } from '../context/useSession'
import { formatCurrency } from '../utils/currency'

interface AgentChatViewProps {
  initialQuery?: string
  onQuerySubmitted?: (query: string) => void
}

export const AgentChatView: React.FC<AgentChatViewProps> = ({
  initialQuery,
  onQuerySubmitted,
}) => {
  const { session, token, addToCart, comparisonIds, toggleCompareProduct, setIsComparisonOpen } =
    useSession()
  const [query, setQuery] = useState(initialQuery || '')
  const queryRef = useRef(query)
  useEffect(() => {
    queryRef.current = query
  }, [query])
  const [inlineError, setInlineError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState<ShoppingAgentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<string[]>([])
  const submittedQueryRef = useRef<string | null>(null)

  const handleSubmit = useCallback(async (qText?: string) => {
    const rawText = qText !== undefined ? qText : queryRef.current
    const textToSubmit = rawText.trim()
    if (!textToSubmit) {
      setInlineError('Please enter a product request before searching with AI.')
      return
    }
    setInlineError(null)

    if (!session?.session_id || !token) {
      setError('Active shopping session is required. Please wait for session initialization.')
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      submittedQueryRef.current = textToSubmit
      if (onQuerySubmitted) {
        onQuerySubmitted(textToSubmit)
      }
      const res = await api.queryAgent(session.session_id, token, {
        query: textToSubmit,
      })
      setResponse(res)
    } catch (err) {
      if (err instanceof ApiErrorResponse) {
        if (err.code === 'LLM_PROVIDER_NOT_CONFIGURED') {
          setError(
            'The LLM Provider is not configured in backend environment variables (LLM_PROVIDER). Set LLM_PROVIDER=mock or configure Gemini credentials in the backend .env file.'
          )
        } else {
          setError(`[${err.code}] ${err.message}`)
        }
      } else {
        setError(err instanceof Error ? err.message : 'Agent query failed')
      }
    } finally {
      setIsLoading(false)
    }
  }, [session, token, onQuerySubmitted])

  // Auto-submit initialQuery when provided (e.g. from Dashboard or URL hash navigation)
  useEffect(() => {
    const trimmed = initialQuery?.trim()
    if (
      trimmed &&
      trimmed !== submittedQueryRef.current &&
      session?.session_id &&
      token
    ) {
      submittedQueryRef.current = trimmed
      setQuery(trimmed)
      setInlineError(null)
      void handleSubmit(trimmed)
    }
  }, [initialQuery, session?.session_id, token, handleSubmit])

  const handleAddToCart = async (productId: string) => {
    const ok = await addToCart(productId, 1)
    if (ok) {
      setAddedIds((prev) => [...prev, productId])
      setTimeout(() => {
        setAddedIds((prev) => prev.filter((id) => id !== productId))
      }, 2500)
    }
  }

  return (
    <div className="assistant-container">
      {/* Breadcrumb Header */}
      <div className="breadcrumb-row">
        <span>DASHBOARD</span>
        <span style={{ opacity: 0.6 }}>&gt;</span>
        <span style={{ color: 'var(--color-secondary)' }}>AI SEARCH RESULTS</span>
      </div>

      {/* Top Header */}
      <div>
        <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
          AI Search Results
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.92rem' }}>
          Dynamic AI product discovery, constraint validation, and deterministic knapsack budget optimization.
        </p>
      </div>

      {/* Budget Overview Card */}
      <div className="budget-overview-card">
        <div className="budget-stats-group">
          <div className="budget-stat-item">
            <span className="budget-stat-label">Budget Ceiling (Per Query)</span>
            <span className="budget-stat-value">
              {response?.budget_summary?.budget_minor
                ? formatCurrency(response.budget_summary.budget_minor, response.budget_summary.currency)
                : 'Not Set (Unconstrained)'}
            </span>
          </div>

          {response?.budget_summary && (
            <>
              <div style={{ height: '36px', width: '1px', backgroundColor: 'var(--color-border)' }} />
              <div className="budget-stat-item">
                <span className="budget-stat-label">Allocated (Knapsack)</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-success)' }}>
                  {formatCurrency(response.budget_summary.allocated_minor, response.budget_summary.currency)}
                </span>
              </div>
              <div className="budget-stat-item">
                <span className="budget-stat-label">Remaining</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                  {formatCurrency(response.budget_summary.remaining_minor, response.budget_summary.currency)}
                </span>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="badge badge-purple">
            <TrendingUp size={12} />
            <span>Deterministic Knapsack Active</span>
          </span>
        </div>
      </div>

      {/* Prominent Natural-Language Dynamic Search Bar */}
      <div className="search-prompt-bar">
        <form
          className="prompt-input-row"
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
        >
          <Sparkles size={18} color="var(--color-secondary)" style={{ flexShrink: 0 }} />
          <input
            id="agent-query-input"
            type="text"
            className="prompt-input-field"
            placeholder="Type any product request in your own words (e.g. noise-canceling headphones under $350)..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (inlineError) setInlineError(null)
            }}
            disabled={isLoading}
          />
          <button
            id="agent-query-submit-btn"
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
            style={{ padding: '9px 18px', borderRadius: '8px', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Search size={15} />
            <span>{isLoading ? 'Searching...' : 'Search with AI'}</span>
          </button>
        </form>

        {/* Inline Validation Error */}
        {inlineError && (
          <div
            id="agent-inline-error"
            className="search-inline-error"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '8px',
              color: 'var(--color-error)',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            <AlertCircle size={14} />
            <span>{inlineError}</span>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: '2px' }}>Assistant Notice</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* Loading State Banner */}
      {isLoading && (
        <div
          className="matte-card"
          style={{
            padding: '36px 20px',
            textAlign: 'center',
            backgroundColor: 'var(--color-neutral)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3px solid var(--color-tertiary)',
              borderTopColor: 'var(--color-secondary)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)' }}>
              Searching catalog with AI reasoning...
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              Parsing constraints, checking stock availability, and calculating budget knapsack.
            </div>
          </div>
        </div>
      )}

      {/* Initial Empty State Before Any Search */}
      {!isLoading && !response && !error && (
        <div
          className="matte-card"
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            borderRadius: '14px',
            backgroundColor: 'var(--color-neutral)',
            border: '1px solid var(--color-border)',
            maxWidth: '640px',
            margin: '0 auto',
          }}
        >
          <Sparkles size={32} color="var(--color-secondary)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
            Enter Your Product Request
          </h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', margin: '0 0 16px' }}>
            Type any product request in your own words above (e.g. noise-canceling headphones under $300, mechanical keyboard with hot-swappable switches).
          </p>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--color-secondary)', fontWeight: 600 }}>
            <ShieldCheck size={14} />
            <span>Zero canned searches &bull; Live deterministic decision engine</span>
          </div>
        </div>
      )}

      {/* Results / Dialogue Area */}
      {response && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Extracted Intent & Constraints Card */}
          <div className="matte-card" style={{ padding: '20px 24px' }}>
            <div className="intent-badge-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge-purple">Parsed Intent</span>
                <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
                  &ldquo;{response.intent.raw_query}&rdquo;
                </span>
              </div>

              {response.budget_summary && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  <DollarSign size={14} color="var(--color-success)" />
                  <span>
                    Knapsack Fits Budget: <strong>{response.budget_summary.fits_within_budget ? 'Yes' : 'No'}</strong>
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
              {response.intent.constraints.category && (
                <span className="badge badge-purple">
                  Category: {response.intent.constraints.category}
                </span>
              )}
              {response.intent.constraints.budget_minor !== null && (
                <span className="badge badge-purple">
                  Ceiling: {formatCurrency(response.intent.constraints.budget_minor, response.intent.constraints.currency)}
                </span>
              )}
              {response.intent.constraints.required_features.map((feat) => (
                <span key={feat} className="badge badge-purple">
                  Spec: {feat}
                </span>
              ))}
            </div>
          </div>

          {/* Ambiguity Clarification Questions Banner */}
          {response.clarification_questions.length > 0 && (
            <div id="agent-clarification-banner" className="alert alert-warning" style={{ flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                <HelpCircle size={18} />
                <span>
                  {response.intent.ambiguity_detected
                    ? 'Clarification Needed (Zero Hallucinations Policy)'
                    : 'Refinement Options'}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', margin: 0 }}>
                The decision engine detected ambiguity or restrictive constraints:
              </p>
              <ul style={{ paddingLeft: '20px', fontSize: '0.85rem', margin: 0 }}>
                {response.clarification_questions.map((q, idx) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommended Products Grid */}
          {response.recommendations.length > 0 ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '14px',
                }}
              >
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-primary)' }}>
                  <Sparkles size={18} color="var(--color-secondary)" />
                  <span>Ranked Recommendations ({response.recommendations.length})</span>
                </h2>

                {comparisonIds.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setIsComparisonOpen(true)}
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  >
                    <Scale size={14} />
                    <span>View Comparison ({comparisonIds.length})</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {response.recommendations.map((rec, index) => {
                  const isAdded = addedIds.includes(rec.product_id)
                  const isCompared = comparisonIds.includes(rec.product_id)
                  const matchPct = Math.round(rec.match_score * 100)

                  return (
                    <div
                      key={rec.product_id}
                      className="matte-card"
                      style={{
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                        backgroundColor: 'var(--color-neutral)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '16px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: '260px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span
                              className="badge badge-dark"
                              style={{ backgroundColor: index === 0 ? 'var(--color-primary)' : 'var(--color-success)', color: 'var(--color-neutral)' }}
                            >
                              {index === 0 ? 'BEST MATCH • ' : ''}{matchPct}% Match
                            </span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                              {rec.brand || 'PayPilot'} &bull; {rec.category}
                            </span>
                          </div>

                          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                            {rec.name}
                          </h3>

                          {/* AI Grounded Explanation Box */}
                          <div className="ai-recommendation-box" style={{ marginTop: '4px' }}>
                            <div className="ai-recommendation-label">
                              <Sparkles size={11} color="var(--color-secondary)" />
                              <span>WHY AI RECOMMENDED</span>
                            </div>
                            <p className="ai-recommendation-text">{rec.explanation}</p>
                          </div>
                        </div>

                        {/* Price & Action Box */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: '10px',
                            minWidth: '160px',
                          }}
                        >
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                              {formatCurrency(rec.price_minor, rec.currency)}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-success)', fontWeight: 600 }}>
                              {rec.available_stock} units available
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className={`btn ${isCompared ? 'btn-secondary' : 'btn-outline'}`}
                              onClick={() => toggleCompareProduct(rec.product_id)}
                              style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                            >
                              <Scale size={14} />
                              <span>{isCompared ? 'Compared' : 'Compare'}</span>
                            </button>

                            <button
                              id="add-rec-cart-btn"
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleAddToCart(rec.product_id)}
                              style={{ padding: '8px 16px', fontSize: '0.82rem' }}
                            >
                              {isAdded ? <Check size={14} /> : <ShoppingCart size={14} />}
                              <span>{isAdded ? 'Added' : 'Add to Cart'}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Source Evidence Pills */}
                      {rec.source_evidence && rec.source_evidence.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            paddingTop: '10px',
                            borderTop: '1px solid var(--color-border)',
                            fontSize: '0.75rem',
                            color: 'var(--color-text-secondary)',
                            flexWrap: 'wrap',
                          }}
                        >
                          <ShieldCheck size={14} color="var(--color-secondary)" />
                          <span style={{ fontWeight: 600 }}>Catalog Sources:</span>
                          {rec.source_evidence.map((s, idx) => (
                            <span key={idx} className="badge badge-purple" style={{ fontSize: '0.7rem' }}>
                              {String(s.source_name || 'Demo Catalog Source')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div
              id="agent-no-results"
              className="matte-card"
              style={{
                padding: '36px 20px',
                textAlign: 'center',
                borderRadius: '14px',
                backgroundColor: 'var(--color-neutral)',
                border: '1px solid var(--color-border)',
              }}
            >
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                No catalog items match current constraints
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', maxWidth: '440px', margin: '0 auto' }}>
                Try adjusting your search criteria, broadening required specifications, or increasing your budget ceiling above.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
