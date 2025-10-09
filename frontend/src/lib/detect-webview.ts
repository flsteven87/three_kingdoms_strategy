/**
 * Detect if user is in an embedded browser (WebView)
 * Google OAuth blocks authentication in WebViews for security reasons
 */

interface WebViewDetectionResult {
  readonly isWebView: boolean
  readonly platform: 'line' | 'facebook' | 'instagram' | 'wechat' | 'twitter' | 'unknown' | null
  readonly suggestion: string
}

export function detectWebView(): WebViewDetectionResult {
  const ua = navigator.userAgent.toLowerCase()

  // LINE in-app browser
  if (ua.includes('line')) {
    return {
      isWebView: true,
      platform: 'line',
      suggestion: '請點擊右上角「⋯」選單，選擇「在瀏覽器中開啟」'
    }
  }

  // Facebook in-app browser
  if (ua.includes('fban') || ua.includes('fbav') || ua.includes('fb_iab')) {
    return {
      isWebView: true,
      platform: 'facebook',
      suggestion: '請點擊右上角「⋯」選單，選擇「在 Safari/Chrome 中開啟」'
    }
  }

  // Instagram in-app browser
  if (ua.includes('instagram')) {
    return {
      isWebView: true,
      platform: 'instagram',
      suggestion: '請點擊右上角「⋯」選單，選擇「在瀏覽器中開啟」'
    }
  }

  // WeChat in-app browser
  if (ua.includes('micromessenger')) {
    return {
      isWebView: true,
      platform: 'wechat',
      suggestion: '請點擊右上角「⋯」，選擇「在瀏覽器中開啟」'
    }
  }

  // Twitter in-app browser
  if (ua.includes('twitter')) {
    return {
      isWebView: true,
      platform: 'twitter',
      suggestion: '請點擊右上角，選擇「在 Safari 中開啟」'
    }
  }

  // Generic WebView detection (iOS/Android)
  const isIOS = /iphone|ipad|ipod/.test(ua)
  const isAndroid = /android/.test(ua)
  const isWebViewGeneric =
    (isIOS && !ua.includes('safari')) ||
    (isAndroid && ua.includes('wv'))

  if (isWebViewGeneric) {
    return {
      isWebView: true,
      platform: 'unknown',
      suggestion: '請使用 Safari、Chrome 或其他瀏覽器開啟此連結'
    }
  }

  return {
    isWebView: false,
    platform: null,
    suggestion: ''
  }
}

export function copyCurrentUrl(): void {
  const url = window.location.href

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).catch(() => {
      // Fallback: create temporary input
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    })
  } else {
    // Fallback for older browsers
    const input = document.createElement('input')
    input.value = url
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
  }
}
