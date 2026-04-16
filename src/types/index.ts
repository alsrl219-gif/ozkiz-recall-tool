// ─── 기본 엔티티 ─────────────────────────────────────────────────
export interface Product {
  id: string          // 상품코드
  name: string        // 상품명
  category: string    // 카테고리
  season: string      // 시즌 (예: 2025SS)
  color?: string
  size?: string
  imageUrl?: string
}

export interface Store {
  id: string          // 매장코드
  name: string        // 매장명
  region: string      // 지역
  managerId?: string  // 담당자
  phone?: string
}

// ─── 재고 ────────────────────────────────────────────────────────
export interface CenterStock {
  productId: string
  qty: number
  updatedAt: string
}

export interface StoreStock {
  storeId: string
  productId: string
  qty: number
  updatedAt: string
}

// ─── 판매 데이터 ─────────────────────────────────────────────────
export interface SaleRecord {
  date: string        // ISO date 'YYYY-MM-DD'
  productId: string
  channel: 'online' | 'offline' | 'coupang'
  storeId?: string    // offline만 해당
  qty: number
  revenue: number
}

// 이지어드민 어드민상품매출통계: 날짜 없는 기간 합계 형태
export interface PeriodSaleAggregate {
  productId: string
  channel: 'online' | 'offline' | 'coupang'
  periodStart: string   // ISO date
  periodEnd: string     // ISO date
  periodDays: number    // 기간 일수
  totalQty: number      // 기간 합계 판매수량
  dailyVelocity: number // totalQty / periodDays
}

// ─── 회수 ────────────────────────────────────────────────────────
export type RecallStatus = 'recommended' | 'requested' | 'in-transit' | 'received' | 'cancelled'
export type RecallPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface RecallItem {
  id: string
  productId: string
  storeId: string
  priority: RecallPriority
  recallScore: number         // 0–100
  suggestedQty: number        // 시스템 권장 수량
  requestedQty?: number       // 매장 확정 수량
  actualQty?: number          // 실제 회수된 수량
  status: RecallStatus
  reason: string              // 회수 사유 설명
  createdAt: string
  updatedAt: string
  completedAt?: string
  note?: string               // 매장 담당자 메모
}

// ─── 분석 결과 ──────────────────────────────────────────────────
export interface RecallRecommendation {
  productId: string
  storeId: string
  priority: RecallPriority
  recallScore: number
  suggestedQty: number
  reason: string
  // 세부 점수
  onlineDemandScore: number     // 온라인 수요 강도
  storeStagnationScore: number  // 매장 재고 정체도
  centerDepletionScore: number  // 센터 재고 소진도
  seasonUrgencyScore: number    // 시즌 긴박도
  // 참고 수치
  onlineVelocity30d: number     // 온라인 일평균 판매
  storeVelocity30d: number      // 매장 일평균 판매
  centerStock: number
  storeStock: number
  remainingSeasonDays: number
}

// ─── 업로드 설정 ─────────────────────────────────────────────────
export type DataSourceType = 'admin_stock' | 'admin_sales' | 'chain_store' | 'coupang'

export interface ColumnMapping {
  productId: string
  barcode?: string        // 바코드 (쿠팡 연결용)
  productName?: string
  storeId?: string
  storeName?: string
  qty: string
  offlineQty?: string     // 매장판매수량 (판매통계용)
  date?: string
  sales?: string
  revenue?: string
  category?: string
  season?: string
  color?: string
  size?: string
  imageUrl?: string       // 이미지URL
}

export interface UploadSession {
  id: string
  sourceType: DataSourceType
  fileName: string
  uploadedAt: string
  rowCount: number
  mapping: ColumnMapping
}

// ─── 앱 설정 ─────────────────────────────────────────────────────
export interface AppSettings {
  seasonEndDate: string           // 현재 시즌 종료일
  analysisWindowDays: number      // 분석 기간 (기본 30일)
  urgentScoreThreshold: number    // 긴급 기준 점수 (기본 80)
  highScoreThreshold: number      // 높음 기준 점수 (기본 60)
  mediumScoreThreshold: number    // 보통 기준 점수 (기본 40)
  maxRecallQtyPerSku: number      // SKU당 최대 회수 수량 (기본 5)
  minTotalStoreStock: number      // SKU 매장 합산 재고 최소값 (기본 10, 미만 시 회수 제외)
  weights: {
    onlineDemand: number          // 온라인 수요 가중치 (기본 0.40)
    centerDepletion: number       // 센터 소진 가중치 (기본 0.35)
    storeStagnation: number       // 매장 정체 가중치 (기본 0.25)
  }
  googleSheetsUrl?: string        // 구글 시트 CSV URL (자동 연동용)
  googleChatWebhookUrl?: string   // Google Chat Incoming Webhook URL
  stores: Store[]
}

export const DEFAULT_SETTINGS: AppSettings = {
  seasonEndDate: '2026-06-30',
  analysisWindowDays: 30,
  urgentScoreThreshold: 80,
  highScoreThreshold: 60,
  mediumScoreThreshold: 40,
  maxRecallQtyPerSku: 5,
  minTotalStoreStock: 10,
  weights: {
    onlineDemand: 0.40,
    centerDepletion: 0.35,
    storeStagnation: 0.25,
  },
  googleSheetsUrl: '',
  googleChatWebhookUrl: '',
  stores: [],
}
