import { SectionHeading, SubHeading } from '@/components/layout/LegalTypography'

export function PrivacyPolicy() {
  return (
    <article className="container mx-auto px-4 py-12 max-w-3xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">隱私權政策</h1>
        <p className="text-sm text-muted-foreground mt-2">最後更新日期：2026 年 3 月 26 日</p>
      </header>

      <div className="prose-sm space-y-4 text-muted-foreground leading-relaxed">
        <p>
          三國志戰略版同盟管理中心（以下簡稱「本服務」）重視您的隱私權。本政策說明我們如何蒐集、使用、儲存及保護您的個人資料，適用於所有使用本服務的使用者。
        </p>

        <SectionHeading>一、資料蒐集範圍</SectionHeading>

        <SubHeading>1.1 您主動提供的資料</SubHeading>
        <ul className="list-disc pl-6 space-y-1">
          <li>帳戶資料：電子郵件地址、姓名（透過 Google OAuth 登入取得）</li>
          <li>同盟資料：同盟名稱、賽季設定</li>
          <li>上傳資料：CSV 檔案中的遊戲統計數據（成員名稱、貢獻值、戰功等）</li>
          <li>付款資料：交易紀錄（信用卡資訊由第三方金流服務商處理，本服務不儲存卡號）</li>
        </ul>

        <SubHeading>1.2 自動蒐集的資料</SubHeading>
        <ul className="list-disc pl-6 space-y-1">
          <li>裝置資訊：瀏覽器類型、作業系統、螢幕解析度</li>
          <li>使用紀錄：功能使用頻率、頁面瀏覽紀錄</li>
          <li>連線資訊：IP 位址、存取時間</li>
        </ul>

        <SectionHeading>二、資料使用目的</SectionHeading>
        <p>我們蒐集的資料僅用於以下目的：</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>提供、維護及改善本服務的功能</li>
          <li>處理付款交易及管理賽季額度</li>
          <li>發送服務相關通知（系統維護、功能更新）</li>
          <li>防止濫用、確保服務安全</li>
          <li>依法令要求配合調查</li>
        </ul>

        <SectionHeading>三、第三方服務</SectionHeading>
        <p>本服務使用以下第三方服務處理您的資料，各服務商有其獨立的隱私政策：</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Supabase</strong>：帳戶驗證及資料儲存（資料中心位於新加坡）</li>
          <li><strong>Google OAuth</strong>：第三方登入驗證</li>
          <li><strong>Recur / PAYUNi</strong>：付款處理（信用卡資料由 PAYUNi 直接處理，符合 PCI DSS 標準）</li>
          <li><strong>LINE</strong>：LINE Bot 通知服務（僅限已綁定 LINE 帳號的使用者）</li>
          <li><strong>Zeabur</strong>：應用程式部署及託管</li>
          <li><strong>Cloudflare</strong>：CDN 及安全防護</li>
        </ul>

        <SectionHeading>四、資料儲存與安全</SectionHeading>
        <ul className="list-disc pl-6 space-y-1">
          <li>所有資料傳輸均使用 HTTPS/TLS 加密</li>
          <li>資料庫啟用列級安全性（Row Level Security），確保使用者只能存取自己的資料</li>
          <li>密碼及敏感資訊以加密形式儲存</li>
          <li>定期備份資料以防止資料遺失</li>
        </ul>

        <SectionHeading>五、資料保留期限</SectionHeading>
        <ul className="list-disc pl-6 space-y-1">
          <li>帳戶資料：保留至您刪除帳戶為止</li>
          <li>同盟及遊戲數據：保留至您主動刪除或帳戶刪除為止</li>
          <li>交易紀錄：依據稅務法規保留 5 年</li>
          <li>系統日誌：保留 90 天後自動清除</li>
        </ul>

        <SectionHeading>六、Cookie 使用</SectionHeading>
        <p>
          本服務使用必要性 Cookie 維持登入狀態及安全驗證。我們不使用追蹤型 Cookie 或第三方廣告 Cookie。
        </p>

        <SectionHeading>七、您的權利</SectionHeading>
        <p>依據個人資料保護法，您享有以下權利：</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>查閱權</strong>：查詢我們持有的您的個人資料</li>
          <li><strong>更正權</strong>：要求更正不正確的個人資料</li>
          <li><strong>刪除權</strong>：要求刪除您的帳戶及相關資料</li>
          <li><strong>可攜權</strong>：要求以通用格式匯出您的資料</li>
          <li><strong>停止處理權</strong>：要求我們停止處理您的個人資料</li>
        </ul>
        <p>
          如需行使上述權利，請來信至{' '}
          <a href="mailto:support@tktmanager.com" className="text-primary hover:underline">
            support@tktmanager.com
          </a>
          ，我們將於 30 個工作日內回覆。
        </p>

        <SectionHeading>八、兒童隱私</SectionHeading>
        <p>
          本服務不針對未滿 16 歲的兒童。我們不會故意蒐集兒童的個人資料。若您發現有未成年人使用本服務，請聯繫我們以便刪除相關資料。
        </p>

        <SectionHeading>九、政策變更</SectionHeading>
        <p>
          本政策如有修訂，我們將於本頁面公告更新內容，並在重大變更時透過電子郵件通知您。繼續使用本服務即表示您同意修訂後的政策。
        </p>

        <SectionHeading>十、聯繫方式</SectionHeading>
        <p>如對本隱私權政策有任何疑問，請透過以下方式聯繫我們：</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            電子郵件：
            <a href="mailto:support@tktmanager.com" className="text-primary hover:underline">
              support@tktmanager.com
            </a>
          </li>
          <li>客服回覆時間：2 個工作日內</li>
        </ul>

      </div>
    </article>
  )
}
