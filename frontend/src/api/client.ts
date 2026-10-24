/**
 * Typed API client for PayPilot AI backend.
 *
 * Implements:
 * - Environment-configured API base URL.
 * - Standard request-id generation (X-Request-ID).
 * - Standard bearer token authorization.
 * - Standard envelope parsing and structured error throwing.
 * - Exact schema alignment with FastAPI backend endpoints.
 */

import type {
  ApiResponse,
  CartData,
  CheckoutPreview,
  OrderData,
  PaginatedResponse,
  PaymentAttemptData,
  ProductDetail,
  ProductFilterParams,
  ProductItem,
  SessionCreateResponse,
  SessionData,
  ShoppingAgentRequest,
  ShoppingAgentResponse,
} from './types'

export class ApiErrorResponse extends Error {
  public code: string
  public status: number
  public field?: string | null

  constructor(message: string, code: string, status: number, field?: string | null) {
    super(message)
    this.name = 'ApiErrorResponse'
    this.code = code
    this.status = status
    this.field = field
  }
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'req_' + Math.random().toString(36).substring(2, 15)
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const url = `${BASE_URL}${path}`
  const headers = new Headers(options.headers || {})

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (!headers.has('X-Request-ID')) {
    headers.set('X-Request-ID', generateRequestId())
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  let json: ApiResponse<T>
  try {
    json = await response.json()
  } catch {
    throw new ApiErrorResponse(
      `Failed to parse server response (${response.status})`,
      'NETWORK_ERROR',
      response.status
    )
  }

  if (!response.ok || (json.errors && json.errors.length > 0)) {
    const primaryError = json.errors?.[0]
    const message = primaryError?.message || `HTTP ${response.status}: Request failed`
    const code = primaryError?.code || `HTTP_${response.status}`
    const field = primaryError?.field
    throw new ApiErrorResponse(message, code, response.status, field)
  }

  return json.data
}

// ── API Methods ──────────────────────────────────────────────────────

export const api = {
  // ── Sessions
  async createSession(metadata?: Record<string, unknown>): Promise<SessionCreateResponse> {
    return request<SessionCreateResponse>('/api/v1/sessions', {
      method: 'POST',
      body: JSON.stringify({ metadata_json: metadata || null }),
    })
  },

  async getSession(sessionId: string, token: string): Promise<SessionData> {
    return request<SessionData>(`/api/v1/sessions/${sessionId}`, { method: 'GET' }, token)
  },

  // ── Products
  async listProducts(params: ProductFilterParams = {}): Promise<PaginatedResponse<ProductItem>> {
    const query = new URLSearchParams()
    if (params.q) query.set('q', params.q)
    if (params.category) query.set('category', params.category)
    if (params.brand) query.set('brand', params.brand)
    if (params.min_price_minor !== undefined) query.set('min_price', params.min_price_minor.toString())
    if (params.max_price_minor !== undefined) query.set('max_price', params.max_price_minor.toString())
    if (params.min_rating !== undefined) query.set('min_rating', params.min_rating.toString())
    if (params.in_stock_only !== undefined) query.set('in_stock', params.in_stock_only ? 'true' : 'false')
    if (params.sort_by) query.set('sort_by', params.sort_by)
    if (params.page) query.set('page', params.page.toString())
    if (params.page_size) query.set('page_size', params.page_size.toString())

    const qs = query.toString()
    return request<PaginatedResponse<ProductItem>>(`/api/v1/products${qs ? `?${qs}` : ''}`)
  },

  async getProduct(productId: string): Promise<ProductDetail> {
    return request<ProductDetail>(`/api/v1/products/${productId}`)
  },

  // ── Shopping Agent
  async queryAgent(
    sessionId: string,
    token: string,
    req: ShoppingAgentRequest
  ): Promise<ShoppingAgentResponse> {
    return request<ShoppingAgentResponse>(
      `/api/v1/sessions/${sessionId}/agent/recommend`,
      {
        method: 'POST',
        body: JSON.stringify(req),
      },
      token
    )
  },

  // ── Cart
  async getCart(sessionId: string, token: string): Promise<CartData> {
    const cart = await request<CartData>(`/api/v1/sessions/${sessionId}/cart`, { method: 'GET' }, token)
    // Normalize aliases for convenient UI access
    cart.cart_id = cart.id
    if (cart.items) {
      cart.items.forEach((item) => {
        item.price_minor = item.unit_price_minor
      })
    }
    return cart
  },

  async addItemToCart(
    sessionId: string,
    token: string,
    productId: string,
    quantity = 1
  ): Promise<CartData> {
    const cart = await request<CartData>(
      `/api/v1/sessions/${sessionId}/cart/items`,
      {
        method: 'POST',
        body: JSON.stringify({ product_id: productId, quantity }),
      },
      token
    )
    cart.cart_id = cart.id
    if (cart.items) {
      cart.items.forEach((item) => {
        item.price_minor = item.unit_price_minor
      })
    }
    return cart
  },

  async updateCartItem(
    sessionId: string,
    token: string,
    itemId: string,
    quantity: number
  ): Promise<CartData> {
    const cart = await request<CartData>(
      `/api/v1/sessions/${sessionId}/cart/items/${itemId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ quantity }),
      },
      token
    )
    cart.cart_id = cart.id
    if (cart.items) {
      cart.items.forEach((item) => {
        item.price_minor = item.unit_price_minor
      })
    }
    return cart
  },

  async removeCartItem(sessionId: string, token: string, itemId: string): Promise<CartData> {
    const cart = await request<CartData>(
      `/api/v1/sessions/${sessionId}/cart/items/${itemId}`,
      {
        method: 'DELETE',
      },
      token
    )
    cart.cart_id = cart.id
    if (cart.items) {
      cart.items.forEach((item) => {
        item.price_minor = item.unit_price_minor
      })
    }
    return cart
  },

  // ── Checkout
  async createCheckoutPreview(sessionId: string, token: string): Promise<CheckoutPreview> {
    const preview = await request<CheckoutPreview>(
      `/api/v1/sessions/${sessionId}/checkout/preview`,
      {
        method: 'POST',
      },
      token
    )
    // Alias order_summary to items and stock_warnings to stock_issues for view convenience
    preview.items = preview.order_summary
    preview.stock_issues = preview.stock_warnings
    return preview
  },

  async confirmCheckout(
    sessionId: string,
    token: string,
    previewToken: string
  ): Promise<OrderData> {
    const order = await request<OrderData>(
      `/api/v1/sessions/${sessionId}/checkout/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ preview_token: previewToken }),
      },
      token
    )
    if (order.items) {
      order.items.forEach((item) => {
        item.price_minor = item.unit_price_minor
      })
    }
    return order
  },

  // ── Payments & Orders
  async createPaymentAttempt(
    orderId: string,
    token: string,
    idempotencyKey?: string
  ): Promise<PaymentAttemptData> {
    const headers: Record<string, string> = {}
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey
    }

    const attempt = await request<PaymentAttemptData>(
      `/api/v1/orders/${orderId}/payments`,
      {
        method: 'POST',
        headers,
      },
      token
    )
    attempt.id = attempt.attempt_id
    return attempt
  },

  async approvePayment(
    orderId: string,
    attemptId: string,
    token: string
  ): Promise<PaymentAttemptData> {
    const attempt = await request<PaymentAttemptData>(
      `/api/v1/orders/${orderId}/payments/${attemptId}/approve`,
      {
        method: 'POST',
      },
      token
    )
    attempt.id = attempt.attempt_id
    return attempt
  },

  async capturePayment(
    orderId: string,
    attemptId: string,
    token: string,
    options?: { simulate_failure?: boolean; failure_reason?: string }
  ): Promise<PaymentAttemptData> {
    const attempt = await request<PaymentAttemptData>(
      `/api/v1/orders/${orderId}/payments/${attemptId}/capture`,
      {
        method: 'POST',
        body: options ? JSON.stringify(options) : undefined,
      },
      token
    )
    attempt.id = attempt.attempt_id
    return attempt
  },

  async getOrder(orderId: string, token: string): Promise<OrderData> {
    const order = await request<OrderData>(`/api/v1/orders/${orderId}`, { method: 'GET' }, token)
    if (order.items) {
      order.items.forEach((item) => {
        item.price_minor = item.unit_price_minor
      })
    }
    return order
  },
}
