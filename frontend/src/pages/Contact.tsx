import { useState, useEffect, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSubmitContactForm } from '@/hooks/use-contact-form'
import type { ContactFormCreate } from '@/lib/api/contact-api'

const CATEGORIES = [
  { value: 'bug', label: '問題回報' },
  { value: 'feature', label: '功能建議' },
  { value: 'payment', label: '付款問題' },
  { value: 'other', label: '其他' },
] as const

function Contact() {
  const [email, setEmail] = useState('')
  const [category, setCategory] = useState<ContactFormCreate['category'] | ''>('')
  const [message, setMessage] = useState('')
  const mutation = useSubmitContactForm()

  // Reset stale mutation state when page is revisited
  useEffect(() => {
    mutation.reset()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !category || message.trim().length < 10) return

    mutation.mutate({ email: email.trim(), category, message: message.trim() })
  }

  if (mutation.isSuccess) {
    return (
      <div className="mx-auto max-w-md py-16 text-center space-y-4">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <h1 className="text-2xl font-bold">已收到您的訊息</h1>
        <p className="text-muted-foreground">
          我們會在 2 個工作天內透過 Email 回覆您
        </p>
        <Link
          to="/landing"
          className="inline-block text-sm text-primary hover:underline"
        >
          ← 返回首頁
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md py-16 space-y-8">
      <header className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">聯繫我們</h1>
        <p className="text-muted-foreground">
          有任何問題或建議，歡迎來信
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">類別</Label>
          <Select
            value={category}
            onValueChange={(v) =>
              setCategory(v as ContactFormCreate['category'])
            }
          >
            <SelectTrigger id="category">
              <SelectValue placeholder="選擇類別" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="message">訊息內容</Label>
          <Textarea
            id="message"
            required
            minLength={10}
            maxLength={2000}
            rows={5}
            placeholder="請描述您的問題或建議..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <p className="text-xs text-muted-foreground text-right">
            {message.length} / 2000
          </p>
        </div>

        {mutation.isError && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            送出失敗，請稍後再試
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={mutation.isPending || !category}
        >
          {mutation.isPending ? '送出中...' : '送出'}
        </Button>
      </form>
    </div>
  )
}

export { Contact }
