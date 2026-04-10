/**
 * Payment API
 *
 * Server-side checkout session creation for promotion code support.
 */

import { axiosInstance } from './base-client'

interface CreateCheckoutSessionRequest {
  customer_email: string
  customer_name?: string
  promotion_code?: string
  success_url: string
  cancel_url?: string
}

interface CreateCheckoutSessionResponse {
  checkout_url: string
}

/**
 * Create a Recur checkout session with optional promotion code.
 * Returns a hosted checkout URL to redirect the user to.
 */
export async function createCheckoutSession(
  params: CreateCheckoutSessionRequest,
): Promise<CreateCheckoutSessionResponse> {
  const response = await axiosInstance.post<CreateCheckoutSessionResponse>(
    '/api/v1/payments/checkout-session',
    params,
  )
  return response.data
}
