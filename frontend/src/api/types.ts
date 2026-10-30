/**
 * Full TypeScript interfaces strictly mirroring backend PayPilot API contracts and Pydantic schemas.
 */

export interface ApiError {
  code: string
  message: string
  field?: string | null
}

export interface ApiResponse<T> {
  data: T
  meta: {
    request_id?: string
    timestamp?: string
    [key: string]: unknown
  }
  errors: ApiError[]
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// ── Session ──────────────────────────────────────────────────────────

export interface SessionCreateResponse {
  session_id: string
  access_token: string
  status: string
  created_at: string
}

export interface SessionData {
  session_id: string
  status: 'active' | 'completed' | 'abandoned' | string
  access_token?: string
  created_at: string
  updated_at?: string
  metadata_json?: Record<string, unknown> | null
}

// ── Product & Catalog ────────────────────────────────────────────────

export interface ProductSource {
  source_type: string
  source_name: string
  source_url: string | null
  price_minor: number | null
  currency: string | null
  is_demo_data: boolean
  verified_at: string | null
}

export interface ProductItem {
  id: string
  sku: string
  name: string
  category: string
  brand: string | null
  price_minor: number
  currency: string
  stock_qty: number
  image_url: string | null
  rating: number | null
  is_active: boolean
  is_demo_data: boolean
}

export interface ProductDetail extends ProductItem {
  description: string | null
  metadata_json: Record<string, unknown> | null
  sources: ProductSource[]
  created_at: string
  updated_at: string
}

export interface ProductFilterParams {
  q?: string
  category?: string
  brand?: string
  min_price_minor?: number
  max_price_minor?: number
  min_rating?: number
  in_stock_only?: boolean
  sort_by?: 'rating' | 'price_asc' | 'price_desc' | 'name'
  page?: number
  page_size?: number
}

// ── Cart ─────────────────────────────────────────────────────────────

export interface CartItem {
  id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price_minor: number
  currency: string
  line_total_minor: number
  // Optional convenience aliases
  price_minor?: number
  product_image_url?: string | null
}

export interface CartData {
  id: string
  cart_id?: string
  session_id: string
  version: number
  items: CartItem[]
  subtotal_minor: number
  currency: string
  item_count: number
}

// ── Checkout Preview & Confirm ───────────────────────────────────────

export interface CheckoutLineItem {
  product_id: string
  product_name: string
  product_image_url?: string | null
  quantity: number
  unit_price_minor: number
  currency: string
  line_total_minor: number
}

export interface PriceChangeWarning {
  product_id: string
  product_name: string
  old_price_minor: number
  new_price_minor: number
}

export interface StockWarning {
  product_id: string
  product_name: string
  requested_qty: number
  available_qty: number
}

export interface CheckoutPreview {
  order_summary: CheckoutLineItem[]
  subtotal_minor: number
  tax_minor: number
  total_minor: number
  currency: string
  price_changes: PriceChangeWarning[]
  stock_warnings: StockWarning[]
  preview_token: string
  expires_at: string
  cart_version: number
  // Optional aliases for backward-compatible views
  items?: CheckoutLineItem[]
  stock_issues?: StockWarning[]
}

// ── Orders & Payments ────────────────────────────────────────────────

export interface OrderItem {
  id: string
  product_id: string
  product_name: string
  product_image_url?: string | null
  quantity: number
  unit_price_minor: number
  currency: string
  line_total_minor: number
  price_minor?: number
}

export interface PaymentAttemptSummary {
  attempt_id: string
  attempt_number: number
  status: string
  created_at: string
  is_demo?: boolean
  demo_notice?: string | null
}

export interface PaymentAttemptData {
  attempt_id: string
  id?: string
  attempt_number?: number
  idempotency_key?: string
  paypal_order_id?: string | null
  approval_url?: string | null
  status: string
  amount_minor?: number
  currency?: string
  failure_reason?: string | null
  captured_at?: string | null
  created_at?: string
  is_demo?: boolean
  demo_notice?: string | null
}

export interface OrderData {
  id: string
  order_number: string
  status: 'pending' | 'payment_processing' | 'paid' | 'payment_failed' | 'cancelled' | string
  subtotal_minor: number
  tax_minor: number
  total_minor: number
  currency: string
  confirmed_by_shopper: boolean
  stock_reserved_until: string | null
  items: OrderItem[]
  payment_attempts: PaymentAttemptSummary[]
  created_at: string
  is_demo_payment?: boolean
  demo_notice?: string | null
}

// ── AI Shopping Agent ────────────────────────────────────────────────

export interface ShoppingConstraint {
  category: string | null
  budget_minor: number | null
  currency: string
  required_features: string[]
  preferences: string[]
  max_results: number
}

export interface ShoppingIntent {
  raw_query: string
  intent_type: string
  constraints: ShoppingConstraint
  ambiguity_detected: boolean
  clarification_questions: string[]
}

export interface ProductRecommendation {
  product_id: string
  sku: string
  name: string
  brand: string | null
  category: string
  price_minor: number
  currency: string
  available_stock: number
  rating: number | null
  match_score: number
  explanation: string
  matched_features: list_or_array<string>
  source_evidence: Record<string, unknown>[]
}

type list_or_array<T> = T[]

export interface ProductComparisonItem {
  product_id: string
  name: string
  price_minor: number
  currency: string
  score: number
  pros: string[]
  cons: string[]
  matched_features: string[]
  missing_features: string[]
}

export interface BudgetOptimizationSummary {
  budget_minor: number | null
  currency: string
  allocated_minor: number
  remaining_minor: number
  fits_within_budget: boolean
  recommended_item_count: number
}

export interface ShoppingAgentRequest {
  query: string
  category?: string
  budget_minor?: number
  currency?: string
  required_features?: string[]
  preferences?: string[]
}

export interface ShoppingAgentResponse {
  intent: ShoppingIntent
  recommendations: ProductRecommendation[]
  comparison: ProductComparisonItem[]
  budget_summary: BudgetOptimizationSummary | null
  clarification_questions: string[]
}
