import { useMutation } from '@tanstack/react-query'
import { submitContactForm } from '@/lib/api/contact-api'

export function useSubmitContactForm() {
  return useMutation({
    mutationFn: submitContactForm,
  })
}
