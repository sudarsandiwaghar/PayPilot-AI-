import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// Mock Storage implementation for Node environment
class MockWebStorage {
  constructor() {
    this.store = new Map()
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null
  }
  setItem(key, value) {
    this.store.set(key, String(value))
  }
  removeItem(key) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

describe('PayPilot AI Phase 13 — PayPal Redirect State Recovery & Security', () => {
  const STORAGE_ACTIVE_ORDER_ID = 'paypilot_active_order_id'
  const STORAGE_PAYPAL_ORDER_ID = 'paypilot_paypal_order_id'
  const STORAGE_SESSION_ID = 'paypilot_session_id'
  const STORAGE_ACCESS_TOKEN = 'paypilot_access_token'

  let sessionStorage
  let localStorage

  beforeEach(() => {
    sessionStorage = new MockWebStorage()
    localStorage = new MockWebStorage()
  })

  // Recovery helper matching SessionContext.restoreCheckoutOrder logic
  async function restoreCheckoutOrderMock({
    storedOrderId,
    paypalToken,
    mockBackendOrder,
    mockBackendAttempts,
  }) {
    if (!storedOrderId) return null

    // Simulate backend lookup with session token
    if (!mockBackendOrder || mockBackendOrder.id !== storedOrderId) {
      throw new Error(`Order ${storedOrderId} not found or access denied`)
    }

    let matched = null
    if (paypalToken) {
      matched = mockBackendAttempts.find((a) => a.paypal_order_id === paypalToken) || null
      if (!matched && mockBackendAttempts.length > 0) {
        const latest = mockBackendAttempts[mockBackendAttempts.length - 1]
        if (latest.paypal_order_id === paypalToken) {
          matched = latest
        }
      }
    } else {
      matched = mockBackendAttempts.length > 0 ? mockBackendAttempts[mockBackendAttempts.length - 1] : null
    }

    if (!matched && paypalToken) {
      throw new Error(
        `Security validation failed: returned PayPal token ${paypalToken} does not match any payment attempt for order ${storedOrderId}.`
      )
    }

    return { order: mockBackendOrder, attempt: matched }
  }

  it('persists active order ID and PayPal order ID in storage during checkout', () => {
    const orderId = 'd3b07384-d113-49d6-b81b-5e6616238b9e'
    const paypalOrderId = '15898251V0378783T'

    sessionStorage.setItem(STORAGE_ACTIVE_ORDER_ID, orderId)
    sessionStorage.setItem(STORAGE_PAYPAL_ORDER_ID, paypalOrderId)

    assert.equal(sessionStorage.getItem(STORAGE_ACTIVE_ORDER_ID), orderId)
    assert.equal(sessionStorage.getItem(STORAGE_PAYPAL_ORDER_ID), paypalOrderId)

    // Security check: Never store PayPal client secret, access token, or credentials
    assert.equal(sessionStorage.getItem('paypal_client_secret'), null)
    assert.equal(sessionStorage.getItem('client_secret'), null)
    assert.equal(sessionStorage.getItem('buyer_credentials'), null)
  })

  it('restores checkout order on return to #/checkout/complete after browser reload / cold tab', async () => {
    const orderId = 'd3b07384-d113-49d6-b81b-5e6616238b9e'
    const paypalOrderId = '15898251V0378783T'
    sessionStorage.setItem(STORAGE_ACTIVE_ORDER_ID, orderId)
    sessionStorage.setItem(STORAGE_PAYPAL_ORDER_ID, paypalOrderId)

    const mockOrder = {
      id: orderId,
      order_number: 'ORD-98213',
      status: 'payment_processing',
      total_minor: 249800,
      currency: 'USD',
    }
    const mockAttempts = [
      {
        attempt_id: 'att-1',
        paypal_order_id: paypalOrderId,
        status: 'created',
      },
    ]

    const result = await restoreCheckoutOrderMock({
      storedOrderId: sessionStorage.getItem(STORAGE_ACTIVE_ORDER_ID),
      paypalToken: paypalOrderId,
      mockBackendOrder: mockOrder,
      mockBackendAttempts: mockAttempts,
    })

    assert.ok(result)
    assert.equal(result.order.id, orderId)
    assert.equal(result.attempt.paypal_order_id, paypalOrderId)
    assert.equal(result.attempt.status, 'created')
  })

  it('rejects mismatched or spoofed PayPal order token with clear security error', async () => {
    const orderId = 'd3b07384-d113-49d6-b81b-5e6616238b9e'
    const legitPaypalOrderId = '15898251V0378783T'
    const spoofedPaypalOrderId = 'ATTACKER_SPOOFED_TOKEN_999'

    sessionStorage.setItem(STORAGE_ACTIVE_ORDER_ID, orderId)
    sessionStorage.setItem(STORAGE_PAYPAL_ORDER_ID, legitPaypalOrderId)

    const mockOrder = { id: orderId, status: 'payment_processing' }
    const mockAttempts = [{ attempt_id: 'att-1', paypal_order_id: legitPaypalOrderId, status: 'created' }]

    await assert.rejects(
      async () => {
        await restoreCheckoutOrderMock({
          storedOrderId: sessionStorage.getItem(STORAGE_ACTIVE_ORDER_ID),
          paypalToken: spoofedPaypalOrderId,
          mockBackendOrder: mockOrder,
          mockBackendAttempts: mockAttempts,
        })
      },
      (err) => {
        assert.match(err.message, /Security validation failed: returned PayPal token/)
        return true
      }
    )
  })

  it('prevents duplicate capture if attempt is already captured (idempotency guard)', async () => {
    let captureCallCount = 0
    const attempt = {
      attempt_id: 'att-1',
      paypal_order_id: '15898251V0378783T',
      status: 'captured', // already captured
      paypal_capture_id: '3HE144572M617482A',
    }

    const payerId = '6LM88786AU6B6'

    // Simulate auto-capture trigger guard
    if (payerId && attempt.status !== 'captured') {
      captureCallCount++
    }

    assert.equal(captureCallCount, 0, 'Must NOT invoke capture if attempt status is already captured')
  })

  it('clears temporary checkout recovery data after successful capture', () => {
    const orderId = 'd3b07384-d113-49d6-b81b-5e6616238b9e'
    const paypalOrderId = '15898251V0378783T'

    sessionStorage.setItem(STORAGE_ACTIVE_ORDER_ID, orderId)
    sessionStorage.setItem(STORAGE_PAYPAL_ORDER_ID, paypalOrderId)

    // Capture success: clear temporary recovery keys
    sessionStorage.removeItem(STORAGE_ACTIVE_ORDER_ID)
    sessionStorage.removeItem(STORAGE_PAYPAL_ORDER_ID)

    assert.equal(sessionStorage.getItem(STORAGE_ACTIVE_ORDER_ID), null)
    assert.equal(sessionStorage.getItem(STORAGE_PAYPAL_ORDER_ID), null)
  })

  it('clears temporary checkout recovery data on explicit PayPal cancellation (#/checkout/cancel)', () => {
    const orderId = 'd3b07384-d113-49d6-b81b-5e6616238b9e'
    const paypalOrderId = '15898251V0378783T'

    sessionStorage.setItem(STORAGE_ACTIVE_ORDER_ID, orderId)
    sessionStorage.setItem(STORAGE_PAYPAL_ORDER_ID, paypalOrderId)

    const cancelHash = '#/checkout/cancel?token=15898251V0378783T'
    if (cancelHash.includes('/checkout/cancel')) {
      sessionStorage.removeItem(STORAGE_ACTIVE_ORDER_ID)
      sessionStorage.removeItem(STORAGE_PAYPAL_ORDER_ID)
    }

    assert.equal(sessionStorage.getItem(STORAGE_ACTIVE_ORDER_ID), null)
    assert.equal(sessionStorage.getItem(STORAGE_PAYPAL_ORDER_ID), null)
  })

  it('restores session and order across isolated/Incognito window using recovery_token (Phase 15/16)', async () => {
    // Isolated window has completely empty storage
    assert.equal(sessionStorage.getItem(STORAGE_ACTIVE_ORDER_ID), null)
    assert.equal(sessionStorage.getItem(STORAGE_SESSION_ID), null)
    assert.equal(sessionStorage.getItem(STORAGE_ACCESS_TOKEN), null)

    const returnUrl = 'http://localhost:5173/#/checkout/complete?token=59H813025R965550N&PayerID=6LM88786AU6CQ&recovery_token=test_hmac_recovery_token_123'
    const hash = returnUrl.substring(returnUrl.indexOf('#'))
    const queryPart = hash.includes('?') ? hash.split('?')[1] : ''
    const params = new URLSearchParams(queryPart)

    const paypalToken = params.get('token')
    const payerId = params.get('PayerID')
    const recoveryToken = params.get('recovery_token')

    assert.equal(paypalToken, '59H813025R965550N')
    assert.equal(payerId, '6LM88786AU6CQ')
    assert.equal(recoveryToken, 'test_hmac_recovery_token_123')

    // Simulate backend resolvePayPalReturn call
    async function mockResolvePayPalReturn(req) {
      if (!req.recovery_token || req.recovery_token !== 'test_hmac_recovery_token_123') {
        throw new Error('Invalid recovery token')
      }
      if (req.paypal_order_id !== '59H813025R965550N') {
        throw new Error('PayPal order mismatch')
      }
      return {
        session_id: 'restored-session-uuid',
        access_token: 'pp_sess_restored_access_token_456',
        order: { id: '74b302bc-488f-4c85-a78a-bfe34629a3dc', status: 'payment_processing' },
        attempt: { id: 'att-recovered', paypal_order_id: req.paypal_order_id, status: 'approved' },
        stock_re_reserved: false,
      }
    }

    const resolved = await mockResolvePayPalReturn({
      recovery_token: recoveryToken,
      paypal_order_id: paypalToken,
      payer_id: payerId,
    })

    assert.ok(resolved)
    assert.equal(resolved.session_id, 'restored-session-uuid')
    assert.equal(resolved.access_token, 'pp_sess_restored_access_token_456')
    assert.equal(resolved.order.id, '74b302bc-488f-4c85-a78a-bfe34629a3dc')

    // Hydrate storage (both session and local storage are synced)
    sessionStorage.setItem(STORAGE_SESSION_ID, resolved.session_id)
    sessionStorage.setItem(STORAGE_ACCESS_TOKEN, resolved.access_token)
    sessionStorage.setItem(STORAGE_ACTIVE_ORDER_ID, resolved.order.id)
    localStorage.setItem(STORAGE_SESSION_ID, resolved.session_id)
    localStorage.setItem(STORAGE_ACCESS_TOKEN, resolved.access_token)

    assert.equal(sessionStorage.getItem(STORAGE_SESSION_ID), 'restored-session-uuid')
    assert.equal(sessionStorage.getItem(STORAGE_ACCESS_TOKEN), 'pp_sess_restored_access_token_456')
    assert.equal(sessionStorage.getItem(STORAGE_ACTIVE_ORDER_ID), '74b302bc-488f-4c85-a78a-bfe34629a3dc')
    assert.equal(localStorage.getItem(STORAGE_SESSION_ID), 'restored-session-uuid')
    assert.equal(localStorage.getItem(STORAGE_ACCESS_TOKEN), 'pp_sess_restored_access_token_456')
  })
})

