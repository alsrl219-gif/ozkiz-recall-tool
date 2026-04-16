import { differenceInDays, parseISO, subDays } from 'date-fns'
import type {
  Product,
  SaleRecord,
  PeriodSaleAggregate,
  CenterStock,
  StoreStock,
  RecallRecommendation,
  RecallPriority,
  AppSettings,
} from '../types'

// ─── 시즌 유틸 ──────────────────────────────────────────────────────
/**
 * 상품 시즌 문자열에서 SS/FW 구분 추출
 * 영문: "2025FW" → "FW", "2026SS" → "SS"
 * 한글: "겨울" → "FW", "여름" → "SS", "봄/가을" → null (양 시즌 표시)
 */
export function getProductSeasonType(season: string | undefined): 'SS' | 'FW' | null {
  if (!season?.trim()) return null
  const s = season.trim()
  const upper = s.toUpperCase()

  // ── 영문 코드 ──
  if (upper.includes('SS') || upper.includes('SP') || upper.includes('SU')) return 'SS'
  if (upper.includes('FW') || upper.includes('FA') || upper.includes('AU') || upper.includes('WI')) return 'FW'

  // ── 한글 시즌 값 (이지어드민: 봄, 여름, 가을, 겨울, 봄/가을, 사계절 등) ──
  if (s.includes('사계절')) return null      // 연중 상품 → 필터 안 함
  const isSS = s.includes('봄') || s.includes('여름')      // Spring / Summer
  const isFW = s.includes('가을') || s.includes('겨울')    // Fall / Winter
  if (isSS && !isFW) return 'SS'
  if (isFW && !isSS) return 'FW'
  return null  // 봄/가을(혼합) or 미인식 → 항상 표시
}

/**
 * 오늘 날짜 기준 현재 시즌 계산
 * SS: 3~8월 / FW: 9~2월
 */
export function getCurrentSeason(date: Date = new Date()): 'SS' | 'FW' {
  const month = date.getMonth() + 1 // 1–12
  return month >= 3 && month <= 8 ? 'SS' : 'FW'
}

/**
 * 시즌 라벨 (e.g., "2026 SS")
 */
export function getCurrentSeasonLabel(date: Date = new Date()): string {
  const season = getCurrentSeason(date)
  const year = date.getFullYear()
  // FW는 해가 걸쳐 있어서 9~12월은 당해 년도, 1~2월은 전년도 FW
  const fwYear = date.getMonth() + 1 <= 2 ? year - 1 : year
  return season === 'SS' ? `${year} SS` : `${fwYear} FW`
}

// ─── 유틸 ──────────────────────────────────────────────────────
function clamp(v: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, v))
}

function normalize(value: number, max: number): number {
  if (max === 0) return 0
  return clamp(value / max)
}

// ─── 판매 속도 계산 ─────────────────────────────────────────────
// periodSales(기간합계)가 있으면 그 dailyVelocity를 우선 사용
// 없으면 일별 SaleRecord에서 계산
export function calcVelocity(
  sales: SaleRecord[],
  productId: string,
  channels: ('online' | 'offline' | 'coupang')[],
  storeId: string | null,
  windowDays: number,
  referenceDate: Date = new Date(),
  periodSales: PeriodSaleAggregate[] = []
): number {
  // periodSales에서 해당 상품+채널 집계가 있으면 그 값 사용
  const periodMatches = periodSales.filter(
    (p) => p.productId === productId && channels.includes(p.channel)
  )
  if (periodMatches.length > 0) {
    // 가장 최근 업로드된 기간 기준으로 합산 (채널별 중복 방지)
    const byChannel = new Map<string, PeriodSaleAggregate>()
    for (const p of periodMatches) {
      const key = p.channel
      const existing = byChannel.get(key)
      // 더 최신 기간(periodEnd 기준) 우선
      if (!existing || p.periodEnd > existing.periodEnd) {
        byChannel.set(key, p)
      }
    }
    return [...byChannel.values()].reduce((s, p) => s + p.dailyVelocity, 0)
  }

  // fallback: 일별 SaleRecord에서 계산
  const cutoff = subDays(referenceDate, windowDays)
  const filtered = sales.filter((s) => {
    if (s.productId !== productId) return false
    if (!channels.includes(s.channel)) return false
    if (storeId && s.storeId !== storeId) return false
    return parseISO(s.date) >= cutoff
  })
  const total = filtered.reduce((sum, s) => sum + s.qty, 0)
  return total / windowDays
}

// ─── 핵심 회수 점수 알고리즘 ────────────────────────────────────
/**
 * 회수 우선순위 점수 (0~100)
 *
 * 구성:
 *   1. 온라인 수요 강도 (40%) — 최근 온라인 판매 속도 (정규화)
 *   2. 센터 재고 소진도 (35%) — 센터 재고 대비 온라인 수요
 *   3. 매장 재고 정체도 (25%) — 매장 판매율이 낮을수록 회수 필요
 *
 * + 시즌 긴박도: 시즌 종료일이 가까울수록 전체 점수 boost
 */
export function calcRecallScore(params: {
  onlineVelocity: number      // 온라인 일평균 판매량
  maxOnlineVelocity: number   // 전체 상품 중 최대 온라인 속도 (정규화용)
  storeVelocity: number       // 해당 매장 일평균 판매량
  centerStock: number
  storeStock: number
  remainingSeasonDays: number
  windowDays: number
  weights: AppSettings['weights']
}): {
  total: number
  onlineDemandScore: number
  centerDepletionScore: number
  storeStagnationScore: number
  seasonUrgencyScore: number
} {
  const {
    onlineVelocity,
    maxOnlineVelocity,
    storeVelocity,
    centerStock,
    storeStock,
    remainingSeasonDays,
    windowDays,
    weights,
  } = params

  // 1. 온라인 수요 강도: 온라인 속도를 전체 상품 최대값 기준으로 정규화
  const onlineDemandScore = normalize(onlineVelocity, maxOnlineVelocity)

  // 2. 센터 재고 소진도: 센터 재고 = 0이면 1.0,
  //    온라인 수요(7일치) 대비 센터 재고가 적을수록 높아짐
  const weeklyOnlineDemand = onlineVelocity * 7
  const centerDepletionScore =
    centerStock === 0
      ? 1.0
      : weeklyOnlineDemand === 0
      ? 0
      : clamp(weeklyOnlineDemand / (centerStock + weeklyOnlineDemand))

  // 3. 매장 재고 정체도: 판매 가능한 상품 중 실제 판매 비율이 낮을수록 높음
  //    sell-through_rate = sold / (sold + remaining)
  const periodStoreSold = storeVelocity * windowDays
  const storeSellThrough =
    storeStock + periodStoreSold === 0
      ? 0
      : periodStoreSold / (periodStoreSold + storeStock)
  const storeStagnationScore = 1 - storeSellThrough

  // 4. 시즌 긴박도 보정 (0.8 ~ 1.3 multiplier)
  //    150일 이상: ×0.8 / 90일 이내: ×1.0 / 30일 이내: ×1.3
  let seasonMultiplier: number
  if (remainingSeasonDays <= 0) {
    seasonMultiplier = 1.5
  } else if (remainingSeasonDays <= 30) {
    seasonMultiplier = 1.3
  } else if (remainingSeasonDays <= 60) {
    seasonMultiplier = 1.15
  } else if (remainingSeasonDays <= 90) {
    seasonMultiplier = 1.0
  } else if (remainingSeasonDays <= 150) {
    seasonMultiplier = 0.9
  } else {
    seasonMultiplier = 0.8
  }

  const seasonUrgencyScore = clamp(1 - remainingSeasonDays / 180) // 참고용

  const weighted =
    onlineDemandScore * weights.onlineDemand +
    centerDepletionScore * weights.centerDepletion +
    storeStagnationScore * weights.storeStagnation

  const total = clamp(weighted * seasonMultiplier) * 100

  return {
    total,
    onlineDemandScore: onlineDemandScore * 100,
    centerDepletionScore: centerDepletionScore * 100,
    storeStagnationScore: storeStagnationScore * 100,
    seasonUrgencyScore: seasonUrgencyScore * 100,
  }
}

// ─── 권장 회수 수량 ──────────────────────────────────────────────
export function calcSuggestedQty(params: {
  onlineVelocity: number
  centerStock: number
  storeStock: number
  remainingSeasonDays: number
  maxQty?: number  // SKU당 최대 회수 수량 (기본 5)
}): number {
  const { onlineVelocity, centerStock, storeStock, remainingSeasonDays, maxQty = 5 } = params
  if (storeStock === 0) return 0
  const remaining = Math.max(0, remainingSeasonDays)
  const expectedTotalOnlineDemand = onlineVelocity * remaining
  const unmetDemand = Math.max(0, expectedTotalOnlineDemand - centerStock)
  const raw = Math.min(storeStock, Math.ceil(unmetDemand))
  return Math.min(raw, maxQty)
}

// ─── 우선순위 레이블 ────────────────────────────────────────────
export function scoreToPriority(score: number, settings: AppSettings): RecallPriority {
  if (score >= settings.urgentScoreThreshold) return 'urgent'
  if (score >= settings.highScoreThreshold) return 'high'
  if (score >= settings.mediumScoreThreshold) return 'medium'
  return 'low'
}

// ─── 전체 회수 추천 목록 생성 ────────────────────────────────────
export function generateRecommendations(params: {
  sales: SaleRecord[]
  periodSales?: PeriodSaleAggregate[]
  centerStocks: CenterStock[]
  storeStocks: StoreStock[]
  settings: AppSettings
  products?: Product[]
  referenceDate?: Date
}): RecallRecommendation[] {
  const { sales, periodSales = [], centerStocks, storeStocks, settings, products = [], referenceDate = new Date() } = params
  const { analysisWindowDays, weights } = settings
  const maxQty = settings.maxRecallQtyPerSku ?? 5
  const minTotalStoreStock = settings.minTotalStoreStock ?? 10
  const remainingSeasonDays = differenceInDays(
    parseISO(settings.seasonEndDate),
    referenceDate
  )

  // 현재 시즌 (SS or FW) — 시즌이 없는 상품은 항상 포함
  const currentSeason = getCurrentSeason(referenceDate)
  const productSeasonMap = new Map<string, 'SS' | 'FW' | null>()
  for (const p of products) {
    productSeasonMap.set(p.id, getProductSeasonType(p.season))
  }

  // SKU별 전체 매장 합산 재고 (최솟값 필터용)
  const totalStoreStockBySkuMap = new Map<string, number>()
  for (const s of storeStocks) {
    totalStoreStockBySkuMap.set(s.productId, (totalStoreStockBySkuMap.get(s.productId) ?? 0) + s.qty)
  }

  // 재고가 있는 매장-상품 조합만 처리
  const stockMap = new Map<string, StoreStock>()
  for (const s of storeStocks) {
    if (s.qty > 0) stockMap.set(`${s.storeId}__${s.productId}`, s)
  }

  const centerMap = new Map<string, number>()
  for (const c of centerStocks) {
    centerMap.set(c.productId, c.qty)
  }

  // 모든 상품의 온라인 속도 계산 (정규화용 최댓값)
  const allProductIds = [...new Set(sales.map((s) => s.productId))]
  // periodSales의 상품도 포함
  const periodProductIds = [...new Set(periodSales.map((p) => p.productId))]
  const allIds = [...new Set([...allProductIds, ...periodProductIds])]

  const velocityMap = new Map<string, number>()
  for (const pid of allIds) {
    const v = calcVelocity(sales, pid, ['online', 'coupang'], null, analysisWindowDays, referenceDate, periodSales)
    velocityMap.set(pid, v)
  }
  const maxOnlineVelocity = Math.max(1, ...Array.from(velocityMap.values()))

  const recommendations: RecallRecommendation[] = []

  for (const [key, storeStock] of stockMap) {
    const [storeId, productId] = key.split('__')

    // ── SKU 총재고 최솟값 필터: 전체 매장 합산 재고가 너무 적으면 제외 ──
    const totalStoreStockForSku = totalStoreStockBySkuMap.get(productId) ?? 0
    if (totalStoreStockForSku < minTotalStoreStock) continue

    // ── 시즌 필터: 다른 시즌 상품은 제외 ──────────────────────────
    const productSeason = productSeasonMap.get(productId)
    if (productSeason !== null && productSeason !== undefined && productSeason !== currentSeason) continue

    const centerStock = centerMap.get(productId) ?? 0
    const onlineVelocity = velocityMap.get(productId) ?? 0
    const storeVelocity = calcVelocity(
      sales,
      productId,
      ['offline'],
      storeId,
      analysisWindowDays,
      referenceDate,
      periodSales
    )

    // 온라인 수요가 없는 상품은 회수 불필요
    if (onlineVelocity < 0.01) continue

    const scores = calcRecallScore({
      onlineVelocity,
      maxOnlineVelocity,
      storeVelocity,
      centerStock,
      storeStock: storeStock.qty,
      remainingSeasonDays,
      windowDays: analysisWindowDays,
      weights,
    })

    if (scores.total < settings.mediumScoreThreshold) continue

    const suggestedQty = calcSuggestedQty({
      onlineVelocity,
      centerStock,
      storeStock: storeStock.qty,
      remainingSeasonDays,
      maxQty,
    })

    if (suggestedQty === 0) continue

    const priority = scoreToPriority(scores.total, settings)

    // 회수 사유 텍스트 생성
    const reasons: string[] = []
    if (centerStock === 0) reasons.push('센터 재고 소진')
    else if (scores.centerDepletionScore > 60) reasons.push('센터 재고 부족')
    if (scores.storeStagnationScore > 70) reasons.push('매장 판매 정체')
    if (remainingSeasonDays <= 30) reasons.push('시즌 종료 임박')
    if (scores.onlineDemandScore > 70) reasons.push('온라인 수요 높음')

    recommendations.push({
      productId,
      storeId,
      priority,
      recallScore: Math.round(scores.total),
      suggestedQty,
      reason: reasons.join(' · '),
      onlineDemandScore: Math.round(scores.onlineDemandScore),
      storeStagnationScore: Math.round(scores.storeStagnationScore),
      centerDepletionScore: Math.round(scores.centerDepletionScore),
      seasonUrgencyScore: Math.round(scores.seasonUrgencyScore),
      onlineVelocity30d: Math.round(onlineVelocity * 10) / 10,
      storeVelocity30d: Math.round(storeVelocity * 10) / 10,
      centerStock,
      storeStock: storeStock.qty,
      remainingSeasonDays,
    })
  }

  // 점수 내림차순 정렬
  return recommendations.sort((a, b) => b.recallScore - a.recallScore)
}

// ─── 채널별 판매 집계 ─────────────────────────────────────────────
export function aggregateSalesByDate(
  sales: SaleRecord[],
  channel: 'online' | 'offline' | 'coupang' | 'all',
  days = 30,
  referenceDate: Date = new Date()
): { date: string; qty: number; revenue: number }[] {
  const cutoff = subDays(referenceDate, days)
  const filtered = sales.filter(
    (s) =>
      parseISO(s.date) >= cutoff &&
      (channel === 'all' || s.channel === channel)
  )
  const byDate = new Map<string, { qty: number; revenue: number }>()
  for (const s of filtered) {
    const cur = byDate.get(s.date) ?? { qty: 0, revenue: 0 }
    byDate.set(s.date, { qty: cur.qty + s.qty, revenue: cur.revenue + s.revenue })
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, val]) => ({ date, ...val }))
}

// ─── ABC 분석 ────────────────────────────────────────────────────
export function abcAnalysis(
  sales: SaleRecord[],
  windowDays = 90,
  referenceDate: Date = new Date()
): { productId: string; totalQty: number; grade: 'A' | 'B' | 'C' }[] {
  const cutoff = subDays(referenceDate, windowDays)
  const byProduct = new Map<string, number>()
  for (const s of sales) {
    if (parseISO(s.date) < cutoff) continue
    byProduct.set(s.productId, (byProduct.get(s.productId) ?? 0) + s.qty)
  }
  const sorted = [...byProduct.entries()].sort(([, a], [, b]) => b - a)
  const total = sorted.reduce((s, [, q]) => s + q, 0)
  let cumulative = 0
  return sorted.map(([productId, totalQty]) => {
    cumulative += totalQty
    const pct = total > 0 ? cumulative / total : 0
    return {
      productId,
      totalQty,
      grade: (pct <= 0.7 ? 'A' : pct <= 0.9 ? 'B' : 'C') as 'A' | 'B' | 'C',
    }
  })
}
