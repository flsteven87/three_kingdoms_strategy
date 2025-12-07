import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertTriangle, ExternalLink, Copy, CheckCircle2 } from 'lucide-react'
import { copyCurrentUrl } from '@/lib/detect-webview'
import { useState } from 'react'

interface WebViewWarningProps {
  readonly platform: string
  readonly suggestion: string
}

export function WebViewWarning({ platform, suggestion }: WebViewWarningProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyUrl = () => {
    copyCurrentUrl()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const platformNames: Record<string, string> = {
    line: 'LINE',
    facebook: 'Facebook',
    instagram: 'Instagram',
    wechat: '微信',
    twitter: 'Twitter',
    unknown: '應用程式'
  }

  return (
    <Alert className="border-muted-foreground/50 bg-muted/50">
      <AlertTriangle className="h-4 w-4 text-muted-foreground" />
      <AlertDescription className="space-y-3">
        <div className="space-y-2">
          <p className="font-medium text-foreground">
            ⚠️ 無法在 {platformNames[platform] || '此瀏覽器'} 中登入
          </p>
          <p className="text-sm text-muted-foreground">
            為了安全性，Google 不允許在應用程式內建瀏覽器中進行登入。
          </p>
          <p className="text-sm font-medium text-foreground">
            {suggestion}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopyUrl}
            className="flex-1 bg-background"
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-primary" />
                已複製網址
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                複製網址
              </>
            )}
          </Button>

          <a
            href={`googlechrome://${window.location.host}${window.location.pathname}`}
            className="flex-1"
          >
            <Button size="sm" variant="outline" className="w-full bg-background">
              <ExternalLink className="h-4 w-4" />
              用 Chrome 開啟
            </Button>
          </a>
        </div>

        <p className="text-xs text-muted-foreground">
          提示：複製網址後，貼到 Safari 或 Chrome 中開啟即可正常登入
        </p>
      </AlertDescription>
    </Alert>
  )
}
