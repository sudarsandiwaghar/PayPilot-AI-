import React, { useState } from 'react'
import {
  Sparkles,
  Send,
  HelpCircle,
  ShieldCheck,
  ShoppingCart,
  Check,
  AlertTriangle,
  Scale,
  DollarSign,
  Layers,
} from 'lucide-react'
import type { ShoppingAgentResponse } from '../api/types'
import { api, ApiErrorResponse } from '../api/client'
import { useSession } from '../context/useSession'
import { formatCurrency } from '../utils/currency'

const SAMPLE_PROMPTS = [
  'Noise-canceling headphones for air travel under $400',
  'Mechanical keyboard with hot-swappable switches under $150',
  'Lightweight laptop with 16GB RAM for programming under $1500',
  'Vague query test: recommend something good',
  'Under-budget test: gaming laptop under $10',
]

export const AgentChatView: React.FC = () => {
  const { session, token, addToCart, isCartLoading } = useSession()
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState<ShoppingAgentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<string[]>([])

  const handleSubmit = async (qText?: string) => {
    const textToSubmit = qText || query
    if (!textToSubmit.trim()) return

    if (!session?.session_id || !token) {
      setError('Active shopping session is required. Please wait for session initialization.')
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const res = await api.queryAgent(session.session_id, token, {
        query: textToSubmit.trim(),
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
  }

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
    <div className="agent-chat-wrap">
      {/* Hero Banner */}
      <div className="glass-panel agent-hero">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 14px', borderRadius: '999px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', color: 'var(--text-accent)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '14px' }}>
          <Sparkles size={14} />
          <span>Grounded Catalog Intelligence</span>
        </div>
        <h1>AI Shopping Assistant & Decision Engine</h1>
        <p>
          State your requirements, budget ceiling, or preferred specs in plain English. The backend decision engine filters inventory, scores candidates deterministically, and synthesizes grounded explanations strictly from catalog evidence.
        </p>

        {/* Query Input Box */}
        <form
          className="agent-query-box"
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
        >
          <input
            type="text"
            className="agent-query-input"
            placeholder="e.g., Wireless noise-canceling headphones for long flights under $400..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
          />
          <button type="submit" className="btn btn-primary" disabled={isLoading || !query.trim()}>
            <Send size={16} />
            <span>{isLoading ? 'Reasoning...' : 'Ask Assistant'}</span>
          </button>
        </form>

        {/* Quick Sample Prompts */}
        <div className="quick-prompts">
          {SAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="prompt-chip"
              onClick={() => {
                setQuery(prompt)
                handleSubmit(prompt)
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={18} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: '2px' }}>AI Shopping Assistant Notice</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* Results Area */}
      {response && (
        <div className="agent-results-box">
          {/* Parsed Intent Summary */}
          <div className="glass-panel intent-summary-card">
            <div>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-subtle)', fontWeight: 600, marginBottom: '4px' }}>
                Extracted Constraints & Intent
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                &ldquo;{response.intent.raw_query}&rdquo;
              </div>
              <div className="intent-meta-tags">
                {response.intent.constraints.category && (
                  <span className="meta-pill">Category: {response.intent.constraints.category}</span>
                )}
                {response.intent.constraints.budget_minor !== null && (
                  <span className="meta-pill">
                    Budget Ceiling: {formatCurrency(response.intent.constraints.budget_minor, response.intent.constraints.currency)}
                  </span>
                )}
                {response.intent.constraints.required_features.map((feat) => (
                  <span key={feat} className="meta-pill">
                    Required: {feat}
                  </span>
                ))}
              </div>
            </div>

            {/* Budget Optimization Summary */}
            {response.budget_summary && response.budget_summary.budget_minor !== null && (
              <div
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                }}
              >
                <DollarSign size={20} color="var(--accent-emerald)" />
                <div style={{ fontSize: '0.8rem' }}>
                  <div style={{ color: 'var(--text-muted)' }}>Budget Knapsack</div>
                  <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                    Allocated: {formatCurrency(response.budget_summary.allocated_minor, response.budget_summary.currency)} / {formatCurrency(response.budget_summary.budget_minor, response.budget_summary.currency)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Ambiguity Clarification Questions Banner */}
          {response.clarification_questions.length > 0 && (
            <div className="clarification-banner">
              <div className="clarification-title">
                <HelpCircle size={18} />
                <span>
                  {response.intent.ambiguity_detected
                    ? 'Clarification Needed: Constraints Ambiguous'
                    : 'Refinement Suggestions'}
                </span>
              </div>
              <p style={{ fontSize: '0.875rem', color: '#fef3c7' }}>
                To avoid hallucinating or making assumptions, the decision layer requires a bit more detail:
              </p>
              <ul style={{ paddingLeft: '20px', fontSize: '0.875rem', color: '#fde68a' }}>
                {response.clarification_questions.map((q, idx) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations List */}
          {response.recommendations.length > 0 ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', fontSize: '1.1rem', fontWeight: 700 }}>
                <Sparkles size={18} color="var(--accent-primary)" />
                <span>Ranked Catalog Recommendations</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                  ({response.recommendations.length} matched)
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {response.recommendations.map((rec) => {
                  const isAdded = addedIds.includes(rec.product_id)
                  const matchPct = Math.round(rec.match_score * 100)

                  return (
                    <div key={rec.product_id} className="glass-panel recommendation-card">
                      <div className="recommendation-score-pill">
                        {matchPct}% Match Score
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '4px' }}>
                          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                            {rec.name}
                          </h3>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            by {rec.brand || 'PayPilot'}
                          </span>
                        </div>

                        {/* Price & Category */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                            {formatCurrency(rec.price_minor, rec.currency)}
                          </span>
                          <span className="card-category-badge" style={{ position: 'static' }}>
                            {rec.category}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--accent-emerald)' }}>
                            {rec.available_stock} in stock
                          </span>
                        </div>

                        {/* Grounded Explanation Quote */}
                        <div className="explanation-quote">
                          <strong>Grounded Assessment:</strong> {rec.explanation}
                        </div>

                        {/* Matched Features */}
                        {rec.matched_features.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0' }}>
                            {rec.matched_features.map((mf) => (
                              <span
                                key={mf}
                                style={{
                                  background: 'rgba(6, 182, 212, 0.1)',
                                  border: '1px solid rgba(6, 182, 212, 0.25)',
                                  color: 'var(--accent-cyan)',
                                  fontSize: '0.72rem',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                }}
                              >
                                ✓ {mf}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Verified Evidence Provenance */}
                        {rec.source_evidence.length > 0 && (
                          <div className="source-evidence-row">
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <ShieldCheck size={13} color="var(--accent-emerald)" />
                              Evidence:
                            </span>
                            {rec.source_evidence.map((src, i) => (
                              <span key={i} className="source-badge">
                                {String(src.source_name)} ({String(src.source_type)})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add to Cart Button */}
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <button
                          type="button"
                          className={`btn ${isAdded ? 'btn-secondary' : 'btn-primary'}`}
                          onClick={() => handleAddToCart(rec.product_id)}
                          disabled={isCartLoading || rec.available_stock <= 0}
                          style={{ minWidth: '140px' }}
                        >
                          {isAdded ? (
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
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* No Recommendations (Empty or Ambiguous) */
            !response.intent.ambiguity_detected && (
              <div className="glass-panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <Scale size={36} color="var(--text-subtle)" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>Zero Matching Products Found</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: '440px', margin: '0 auto' }}>
                  The backend database strictly enforced your hard price ceiling and category constraints. No items were hallucinated.
                </p>
              </div>
            )
          )}

          {/* Side-by-Side Comparison from Agent */}
          {response.comparison.length > 1 && (
            <div className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontWeight: 700 }}>
                <Layers size={18} color="var(--accent-secondary)" />
                <span>Side-by-Side Candidate Comparison</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${response.comparison.length}, 1fr)`, gap: '16px', overflowX: 'auto' }}>
                {response.comparison.map((comp) => (
                  <div
                    key={comp.product_id}
                    style={{
                      background: 'rgba(15, 23, 42, 0.5)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      padding: '16px',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                      {comp.name}
                    </div>
                    <div style={{ color: 'var(--accent-cyan)', fontWeight: 800, marginBottom: '12px' }}>
                      {formatCurrency(comp.price_minor, comp.currency)}
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)', fontWeight: 600, marginBottom: '4px' }}>
                        Strengths:
                      </div>
                      <ul style={{ paddingLeft: '16px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {comp.pros.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>

                    {comp.cons.length > 0 && (
                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', fontWeight: 600, marginBottom: '4px' }}>
                          Trade-offs:
                        </div>
                        <ul style={{ paddingLeft: '16px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          {comp.cons.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
