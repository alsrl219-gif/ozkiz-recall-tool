import { BookOpen, Upload, BarChart3, RefreshCw, CheckCircle, AlertTriangle, Package, Store, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../utils/helpers'

interface SectionProps {
  icon: React.ElementType
  color: string
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function Section({ icon: Icon, color, title, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className="flex-1 text-sm font-semibold text-gray-900">{title}</span>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-gray-50 pt-4 text-sm text-gray-700 space-y-3">
          {children}
        </div>
      )}
    </div>
  )
}

function Step({ n, text, sub }: { n: number; text: string; sub?: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
        {n}
      </div>
      <div>
        <div className="font-medium text-gray-900">{text}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{sub}</div>}
      </div>
    </div>
  )
}

function Tag({ color, label }: { color: string; label: string }) {
  return <span className={cn('inline-block text-xs font-semibold px-2 py-0.5 rounded-full', color)}>{label}</span>
}

export default function Guide() {
  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-2xl bg-brand-500 flex items-center justify-center">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">사용 설명서</h2>
          <p className="text-xs text-gray-500">처음 사용하시는 분도 이 페이지만 보면 됩니다</p>
        </div>
      </div>

      {/* 빠른 시작 */}
      <div className="bg-brand-50 border border-brand-100 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-brand-900 mb-3">이 툴이 하는 일</h3>
        <p className="text-sm text-brand-800 leading-relaxed">
          온라인에서 잘 팔리는 상품이 센터 재고 부족으로 품절되는 것을 막기 위해,
          각 매장에 쌓여 있는 재고를 센터로 회수해야 하는 상품을 자동으로 찾아줍니다.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-brand-700">
          <span className="bg-white px-2 py-1 rounded-lg border border-brand-100">① 데이터 업로드</span>
          <span className="text-brand-400">→</span>
          <span className="bg-white px-2 py-1 rounded-lg border border-brand-100">② 회수 분석 실행</span>
          <span className="text-brand-400">→</span>
          <span className="bg-white px-2 py-1 rounded-lg border border-brand-100">③ 매장에 회수 요청</span>
          <span className="text-brand-400">→</span>
          <span className="bg-white px-2 py-1 rounded-lg border border-brand-100">④ 입고 확인</span>
        </div>
        <p className="text-xs text-brand-600 mt-3">
          ✓ 업로드한 데이터는 새로고침해도 유지됩니다. 회수 결정 내역도 보존됩니다.
        </p>
      </div>

      {/* 1. 데이터 업로드 */}
      <Section icon={Upload} color="bg-brand-500" title="1. 데이터 업로드 방법" defaultOpen={true}>
        <p className="text-gray-500 text-xs mb-1">
          <Link to="/upload" className="text-brand-600 underline">데이터 업로드</Link> 탭으로 이동해서 아래 순서대로 파일을 올리세요.
          <strong className="text-gray-700"> .xls, .csv 파일 모두 업로드 가능합니다.</strong>
        </p>

        <div className="space-y-4">
          {/* ① 현재고 */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-gray-700 mb-2">① 이지어드민 · 현재고조회</div>
            <Step n={1} text="이지어드민 → 재고관리 → 현 재고조회" />
            <Step n={2} text="오른쪽 다운로드 템플릿을 '온오프RT용'으로 선택"
              sub="드롭다운에서 '온오프RT용' 선택 필수 — 상품코드·바코드·가용재고·매장총재고·이미지URL이 포함된 형식입니다" />
            <Step n={3} text="초록색 '다운로드(F6)' 버튼 클릭" />
            <Step n={4} text="다운받은 .xls 파일을 업로드 후 '저장 및 적용'" />
          </div>

          {/* ② 판매통계 */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-gray-700 mb-2">② 이지어드민 · 어드민상품매출통계</div>
            <Step n={1} text="이지어드민 → 정산/통계 → 어드민상품매출통계" />
            <Step n={2} text="기간 설정: 최근 90일 권장" sub="예: 2026-01-13 ~ 2026-04-13" />
            <Step n={3} text="오른쪽 다운로드 템플릿을 '온오프RT용'으로 선택" sub="드롭다운에서 '온오프RT용' 선택" />
            <Step n={4} text="초록색 '다운로드(F6)' 버튼 클릭" />
            <Step n={5} text="다운받은 파일을 업로드" />
            <Step n={6} text="업로드 화면 주황색 박스의 날짜를 이지어드민에서 다운받을 때 설정한 기간과 동일하게 입력"
              sub="예: 시작일 2026-01-13, 종료일 2026-04-13 → 앱이 이 기간으로 일평균 판매량을 계산합니다" />
          </div>

          {/* ③ 이지체인 재고 */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-gray-700 mb-2">③ 이지체인 · 매장별 재고</div>
            <Step n={1} text="이지체인 → 본사관리 → BA00-재고조회" />
            <Step n={2} text="전체 매장 선택 → 다운로드" />
            <Step n={3} text="업로드 시 매장 컬럼 자동 인식 (피벗 형태)"
              sub="'감지된 매장 N개' 초록색 박스가 보이면 정상입니다" />
          </div>

          {/* ④ 이지체인 판매현황 */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-gray-700 mb-2">④ 이지체인 · 매장별 판매현황</div>
            <Step n={1} text="이지체인 → 정산/통계 → E200-상품별판매현황" />
            <Step n={2} text="기간: 최근 90일, 전체 매장 선택 후 전체 다운로드" />
            <Step n={3} text="다운받은 파일 업로드 → 상품코드·수량 컬럼 매핑 후 저장" />
          </div>

          {/* ⑤ 쿠팡 */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-gray-700 mb-2">⑤ 쿠팡 · 로켓배송 물류지표 (선택)</div>
            <Step n={1} text="쿠팡 Wing → 애널리틱스 → 기본물류지표(Rocket)" />
            <Step n={2} text="날짜 설정 (최근 30~90일) → 검색" />
            <Step n={3} text="'전체 데이터 다운로드' 클릭" />
            <Step n={4} text="업로드 시 '출고수량'이 판매량으로 자동 매핑됩니다" />
          </div>
        </div>

        <div className="mt-3 bg-orange-50 border border-orange-100 rounded-xl p-3 text-xs text-orange-800">
          <strong>주의:</strong> ① 현재고 업로드를 먼저 해야 ⑤ 쿠팡 데이터의 바코드↔상품코드 연결이 작동합니다.
        </div>
      </Section>

      {/* 2. 분석 실행 */}
      <Section icon={RefreshCw} color="bg-purple-500" title="2. 회수 분석 실행">
        <Step n={1} text="왼쪽 하단 '회수 분석 실행' 버튼 클릭" sub="또는 대시보드 빈 화면의 '분석 실행' 버튼" />
        <Step n={2} text="대시보드에 회수 권장 목록이 자동 생성됩니다" />
        <div className="bg-gray-50 rounded-xl p-4 mt-3">
          <div className="text-xs font-bold text-gray-700 mb-2">회수 점수 계산 방식</div>
          <div className="space-y-1.5 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>온라인 수요 (일평균 판매 속도)</span>
              <span className="font-semibold">40%</span>
            </div>
            <div className="flex justify-between">
              <span>센터 재고 소진도 (가용재고 부족 정도)</span>
              <span className="font-semibold">35%</span>
            </div>
            <div className="flex justify-between">
              <span>매장 정체도 (매장 재고 과다 여부)</span>
              <span className="font-semibold">25%</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-500">× 시즌 긴급도 보정 (시즌 종료 임박 시 점수 상승)</div>
        </div>
      </Section>

      {/* 3. 우선순위 */}
      <Section icon={AlertTriangle} color="bg-red-500" title="3. 우선순위 & 점수 읽는 법">
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-2.5 bg-red-50 rounded-xl">
            <Tag color="bg-red-100 text-red-700" label="긴급" />
            <span className="text-xs text-gray-700">점수 80점 이상 · 즉시 회수 필요 (센터 품절 임박)</span>
          </div>
          <div className="flex items-center gap-3 p-2.5 bg-orange-50 rounded-xl">
            <Tag color="bg-orange-100 text-orange-700" label="높음" />
            <span className="text-xs text-gray-700">점수 60~79점 · 이번 주 내 처리 권장</span>
          </div>
          <div className="flex items-center gap-3 p-2.5 bg-yellow-50 rounded-xl">
            <Tag color="bg-yellow-100 text-yellow-700" label="보통" />
            <span className="text-xs text-gray-700">점수 40~59점 · 여유 있을 때 처리</span>
          </div>
          <div className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-xl">
            <Tag color="bg-gray-100 text-gray-600" label="낮음" />
            <span className="text-xs text-gray-700">점수 40점 미만 · 선택적 처리</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          권장 수량 숫자를 <strong>클릭</strong>하면 직접 수정할 수 있습니다 (Enter로 확정, Esc로 취소).
        </p>
      </Section>

      {/* 4. 회수 처리 */}
      <Section icon={CheckCircle} color="bg-green-500" title="4. 회수 요청 처리 순서">
        <div className="space-y-3">
          <Step n={1} text="'회수 요청' 버튼 클릭"
            sub="해당 상품 행에 마우스를 올리면 버튼이 나타납니다" />
          <Step n={2} text="수량 확인 후 요청 확정"
            sub="팝업에서 요청 수량 조정 가능, 메모 입력 가능" />
          <Step n={3} text="매장에 회수 지시 후 '이송 처리' 클릭"
            sub="상태: 회수 권장 → 요청됨 → 이송 중" />
          <Step n={4} text="센터 입고 확인 후 '입고 확인' 클릭"
            sub="상태: 이송 중 → 입고 완료 · 이력에 누적 기록됨" />
        </div>
        <div className="mt-3 bg-green-50 border border-green-100 rounded-xl p-3 text-xs text-green-800">
          <strong>팁:</strong> 회수 이력은 새로고침해도 보존됩니다. 완료된 내역은 <Link to="/history" className="underline">회수 이력</Link> 탭에서 확인하세요.
        </div>
      </Section>

      {/* 5. 매장별 현황 */}
      <Section icon={Store} color="bg-blue-500" title="5. 매장별 현황 탭">
        <p>각 매장의 재고 현황과 회수 대상 수량을 한눈에 봅니다.</p>
        <ul className="list-disc list-inside text-xs text-gray-600 space-y-1 mt-2">
          <li>매장별 총 재고 수량</li>
          <li>회수 권장 상품 수 및 수량</li>
          <li>정체 재고 비율</li>
        </ul>
      </Section>

      {/* 6. 분석 탭 */}
      <Section icon={BarChart3} color="bg-indigo-500" title="6. 분석 탭">
        <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
          <li>ABC 분석: 매출 기여도별 상품 등급 (A=상위 80%, B=15%, C=5%)</li>
          <li>채널별 판매 추이 (온라인/매장/쿠팡)</li>
          <li>시즌별 재고 현황</li>
        </ul>
      </Section>

      {/* 7. FAQ */}
      <Section icon={Package} color="bg-gray-500" title="자주 묻는 질문 (FAQ)">
        <div className="space-y-4">
          <div>
            <div className="font-semibold text-gray-800 text-xs mb-1">Q. 새로고침하면 데이터가 사라지나요?</div>
            <div className="text-xs text-gray-600">아니요. 업로드한 데이터와 회수 결정 내역 모두 브라우저 저장소(IndexedDB)에 보존됩니다. 브라우저 데이터를 직접 삭제하지 않는 한 유지됩니다.</div>
          </div>
          <div>
            <div className="font-semibold text-gray-800 text-xs mb-1">Q. .xls 파일과 .csv 파일 둘 다 업로드 가능한가요?</div>
            <div className="text-xs text-gray-600">네. 이지어드민/이지체인에서 내보내는 .xls(HTML 형식)와 쿠팡의 .csv 모두 자동으로 인식합니다. 파일 형식을 변환할 필요 없습니다.</div>
          </div>
          <div>
            <div className="font-semibold text-gray-800 text-xs mb-1">Q. 파일 업로드 시 컬럼이 깨져서 나와요.</div>
            <div className="text-xs text-gray-600">EUC-KR/UTF-8 인코딩을 자동 감지합니다. 그래도 깨지면 파일을 엑셀에서 열어 UTF-8 CSV로 다시 저장 후 업로드하세요.</div>
          </div>
          <div>
            <div className="font-semibold text-gray-800 text-xs mb-1">Q. 매장이 1개만 나와요.</div>
            <div className="text-xs text-gray-600">이지체인 BA00-재고조회에서 전체 매장을 선택해서 다운로드했는지 확인하세요.</div>
          </div>
          <div>
            <div className="font-semibold text-gray-800 text-xs mb-1">Q. 쿠팡 데이터를 넣었는데 연결이 안 돼요.</div>
            <div className="text-xs text-gray-600">쿠팡은 바코드로 상품을 식별합니다. ① 현재고조회를 먼저 업로드해야 바코드↔상품코드 매핑이 생성됩니다.</div>
          </div>
          <div>
            <div className="font-semibold text-gray-800 text-xs mb-1">Q. 회수 점수가 너무 높거나 낮아요.</div>
            <div className="text-xs text-gray-600"><Link to="/settings" className="text-brand-600 underline">설정</Link> 탭에서 임계값(센터 재고 기준일, 시즌 긴급도 등)을 조정할 수 있습니다.</div>
          </div>
        </div>
      </Section>
    </div>
  )
}
