import { Link } from 'react-router-dom'
import { PRICE_PER_SEASON } from '@/constants'
import { SectionHeading } from '@/components/layout/LegalTypography'

export function TermsOfService() {
  return (
    <article className="container mx-auto px-4 py-12 max-w-3xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">服務條款</h1>
        <p className="text-sm text-muted-foreground mt-2">最後更新日期：2026 年 3 月 26 日</p>
      </header>

      <div className="prose-sm space-y-4 text-muted-foreground leading-relaxed">
        <p>
          歡迎使用三國志戰略版同盟管理中心（以下簡稱「本服務」）。使用本服務前，請詳閱以下條款。註冊帳戶或使用本服務即表示您同意受本條款約束。
        </p>

        <SectionHeading>一、服務說明</SectionHeading>
        <p>
          本服務為三國志戰略版遊戲玩家提供同盟數據管理工具，功能包括：
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>CSV 資料上傳與解析：匯入遊戲同盟統計數據</li>
          <li>成員表現分析：趨勢圖、排名、對比分析</li>
          <li>霸業積分計算：自訂權重的綜合評分系統</li>
          <li>戰役事件追蹤：記錄與分析重要戰役</li>
          <li>多人協作：邀請同盟幹部共同管理</li>
          <li>LINE Bot 通知：與 LINE 整合的即時通知</li>
        </ul>

        <SectionHeading>二、帳戶管理</SectionHeading>
        <ul className="list-disc pl-6 space-y-1">
          <li>您必須透過 Google 帳戶登入使用本服務</li>
          <li>您應確保帳戶安全，不得將帳戶提供予他人使用</li>
          <li>因帳戶遭未經授權使用所產生的損失，由您自行承擔</li>
          <li>我們保留因違反條款而停用帳戶的權利</li>
        </ul>

        <SectionHeading>三、付款條款</SectionHeading>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            本服務提供 14 天免費試用（限一個賽季）。試用期結束後，開啟新賽季需購買額度
          </li>
          <li>
            賽季額度為一次性購買，每季 NT${PRICE_PER_SEASON.toLocaleString()} 元
          </li>
          <li>付款透過 Recur / PAYUNi 金流服務處理，支援 VISA 及 JCB 信用卡</li>
          <li>購買完成後即可使用，已購買的額度無使用期限</li>
          <li>所有價格均為新台幣計價，含稅</li>
        </ul>

        <SectionHeading>四、使用規範</SectionHeading>
        <p>使用本服務時，您同意不得：</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>上傳違法、侵權或惡意內容</li>
          <li>嘗試未經授權存取其他使用者的資料</li>
          <li>使用自動化工具大量存取本服務（爬蟲、機器人等）</li>
          <li>干擾或破壞本服務的正常運作</li>
          <li>轉售或商業性地重新散布本服務的功能</li>
        </ul>

        <SectionHeading>五、智慧財產權</SectionHeading>
        <ul className="list-disc pl-6 space-y-1">
          <li>本服務的程式碼、介面設計、商標等智慧財產權歸本服務所有</li>
          <li>您上傳的資料（CSV、同盟數據）之所有權歸您所有</li>
          <li>您授予本服務處理您上傳資料的必要權限，僅限於提供服務之用途</li>
          <li>「三國志戰略版」為遊戲原廠之商標，本服務為獨立第三方工具</li>
        </ul>

        <SectionHeading>六、服務可用性</SectionHeading>
        <ul className="list-disc pl-6 space-y-1">
          <li>我們致力維持服務穩定，但不保證 100% 不中斷</li>
          <li>定期維護將提前通知，緊急維護除外</li>
          <li>因不可抗力（天災、第三方服務中斷等）造成的服務中斷，不構成違約</li>
        </ul>

        <SectionHeading>七、責任限制</SectionHeading>
        <ul className="list-disc pl-6 space-y-1">
          <li>本服務以「現況」提供，不就資料分析結果之正確性提供保證</li>
          <li>
            本服務對間接損害、利潤損失、資料遺失等不承擔賠償責任
          </li>
          <li>
            如因本服務之過失造成您的直接損害，賠償上限為您過去 12 個月內支付的費用總額
          </li>
        </ul>

        <SectionHeading id="refund">八、退款政策</SectionHeading>

        <p className="font-medium text-foreground">免費試用</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>新用戶首次使用可享 14 天免費試用，期間可使用完整功能</li>
          <li>試用期結束不會自動收費，由您自行決定是否購買</li>
        </ul>

        <p className="font-medium text-foreground">不退款條款</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            賽季額度為數位服務商品，購買後立即開通使用。依據消費者保護法第 19
            條及「通訊交易解除權合理例外情事適用準則」第 2 條第 5
            款，本服務屬一經提供即為完成之線上服務，不適用 7 天猶豫期間
          </li>
          <li>
            您在購買前已享有 14
            天免費試用期，可充分體驗所有功能後再決定是否購買。因此，所有購買均為最終銷售，<strong>不提供退款</strong>
          </li>
        </ul>

        <p className="font-medium text-foreground">例外情形</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>系統錯誤導致重複扣款，我們將主動退回多收款項</li>
          <li>因本服務之過失造成服務持續無法使用超過 72 小時，可申請補償</li>
        </ul>

        <p className="font-medium text-foreground">付款爭議</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            如有任何付款相關問題，請透過
            <Link to="/contact" className="text-primary hover:underline">聯絡我們</Link>
            頁面提交表單，我們將於 2 個工作日內回覆處理
          </li>
        </ul>

        <SectionHeading>九、帳戶終止</SectionHeading>
        <ul className="list-disc pl-6 space-y-1">
          <li>您可以隨時來信要求刪除帳戶，我們將於 14 個工作日內處理</li>
          <li>帳戶刪除後，相關資料將依隱私權政策的保留期限處理</li>
          <li>帳戶刪除後，未使用的賽季額度將一併失效，不予退款</li>
        </ul>

        <SectionHeading>十、條款修訂</SectionHeading>
        <p>
          本條款如有修訂，我們將於本頁面公告並透過電子郵件通知重大變更。修訂後繼續使用本服務即視為同意新條款。如不同意修訂，請停止使用並來信申請帳戶刪除。
        </p>

        <SectionHeading>十一、準據法與管轄</SectionHeading>
        <p>
          本條款以中華民國（台灣）法律為準據法。因本條款所生之爭議，雙方同意以台灣台北地方法院為第一審管轄法院。
        </p>

        <SectionHeading>十二、聯繫方式</SectionHeading>
        <p>如對本服務條款有任何疑問，請透過以下方式聯繫我們：</p>
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
