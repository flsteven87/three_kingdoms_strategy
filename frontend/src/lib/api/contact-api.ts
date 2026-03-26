import { axiosInstance } from './base-client'

interface ContactFormCreate {
  readonly email: string
  readonly category: 'bug' | 'feature' | 'payment' | 'other'
  readonly message: string
}

interface ContactFormResponse {
  readonly success: boolean
}

export async function submitContactForm(
  data: ContactFormCreate,
): Promise<ContactFormResponse> {
  const response = await axiosInstance.post<ContactFormResponse>(
    '/api/v1/contact',
    data,
  )
  return response.data
}

export type { ContactFormCreate, ContactFormResponse }
