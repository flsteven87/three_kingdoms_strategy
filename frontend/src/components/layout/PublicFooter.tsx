import { Link } from 'react-router-dom'

const FOOTER_LINKS = [
  { label: '隱私權政策', to: '/privacy' },
  { label: '服務條款', to: '/terms' },
  { label: '退款政策', to: '/terms#refund' },
] as const

export function PublicFooter() {
  return (
    <footer className="border-t py-8">
      <div className="container mx-auto px-4 space-y-4">
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="text-center space-y-1">
          <p className="text-xs text-muted-foreground">
            聯繫我們：support@tktmanager.com
          </p>
          <p className="text-xs text-muted-foreground">
            © 2026 三國志戰略版同盟管理中心
          </p>
        </div>
      </div>
    </footer>
  )
}
