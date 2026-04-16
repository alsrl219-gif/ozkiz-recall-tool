import Papa from 'papaparse'
import { differenceInDays, parseISO } from 'date-fns'
import type {
  ColumnMapping,
  DataSourceType,
  SaleRecord,
  CenterStock,
  StoreStock,
  Product,
  PeriodSaleAggregate,
} from '../types'

export interface ParsedRow {
  [key: string]: string
}

export function parseCSV(file: File): Promise<{ headers: string[]; rows: ParsedRow[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer
        // UTF-8로 먼저 디코딩 → 깨지면 EUC-KR 재시도
        const utf8 = new TextDecoder('utf-8').decode(buffer)
        const text = utf8.includes('\ufffd')
          ? new TextDecoder('euc-kr').decode(buffer)
          : utf8

        // HTML 기반 XLS 감지 (이지어드민/이지체인 내보내기)
        if (text.trimStart().toLowerCase().startsWith('<')) {
          resolve(parseHtmlTable(text))
          return
        }

        const result = Papa.parse<ParsedRow>(text, { header: true, skipEmptyLines: true })
        resolve({ headers: result.meta.fields ?? [], rows: result.data })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('파일 읽기 실패'))
    reader.readAsArrayBuffer(file)
  })
}

// HTML 테이블 기반 XLS 파싱 (이지어드민/이지체인 내보내기 형식)
function parseHtmlTable(html: string): { headers: string[]; rows: ParsedRow[] } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return { headers: [], rows: [] }

  const allRows = Array.from(table.querySelectorAll('tr'))
  if (allRows.length === 0) return { headers: [], rows: [] }

  // 첫 번째 행 = 헤더
  const headerCells = Array.from(allRows[0].querySelectorAll('th, td'))
  const headers = headerCells.map((c) => c.textContent?.trim() ?? '').filter(Boolean)

  // 나머지 행 = 데이터
  const rows: ParsedRow[] = []
  for (let i = 1; i < allRows.length; i++) {
    const cells = Array.from(allRows[i].querySelectorAll('td, th'))
    if (cells.length === 0) continue
    const row: ParsedRow = {}
    cells.forEach((cell, j) => {
      if (headers[j]) row[headers[j]] = cell.textContent?.trim() ?? ''
    })
    rows.push(row)
  }

  return { headers, rows }
}

export function parseCSVText(text: string): { headers: string[]; rows: ParsedRow[] } {
  const result = Papa.parse<ParsedRow>(text, {
    header: true,
    skipEmptyLines: true,
  })
  return { headers: result.meta.fields ?? [], rows: result.data }
}

// ─── 숫자 파싱 헬퍼 ──────────────────────────────────────────────
function toInt(raw: string | undefined): number {
  if (!raw) return 0
  return parseInt(raw.replace(/,/g, '').trim(), 10) || 0
}
function toFloat(raw: string | undefined): number {
  if (!raw) return 0
  return parseFloat(raw.replace(/,/g, '').trim()) || 0
}

// ─── 이지어드민 현재고조회 → 센터 재고 + 상품 마스터 + 바코드맵 ────
export interface AdminStockResult {
  centerStocks: CenterStock[]
  products: Product[]
  barcodeMap: Record<string, string>  // { 바코드: 상품코드 }
}

export function parseAdminStock(rows: ParsedRow[], mapping: ColumnMapping): AdminStockResult {
  const centerStocks: CenterStock[] = []
  const products: Product[] = []
  const barcodeMap: Record<string, string> = {}
  const now = new Date().toISOString()

  for (const row of rows) {
    const productId = row[mapping.productId]?.trim()
    if (!productId) continue

    const qty = toInt(row[mapping.qty])
    centerStocks.push({ productId, qty, updatedAt: now })

    // 바코드 매핑 저장 (쿠팡 연결용)
    const barcode = mapping.barcode ? row[mapping.barcode]?.trim() : undefined
    if (barcode) barcodeMap[barcode] = productId

    // 상품 마스터 생성
    products.push({
      id: productId,
      name: mapping.productName ? row[mapping.productName]?.trim() ?? productId : productId,
      category: mapping.category ? row[mapping.category]?.trim() ?? '' : '',
      season: mapping.season ? row[mapping.season]?.trim() ?? '' : '',
      color: mapping.color ? row[mapping.color]?.trim() : undefined,
      size: mapping.size ? row[mapping.size]?.trim() : undefined,
      imageUrl: mapping.imageUrl ? row[mapping.imageUrl]?.trim() || undefined : undefined,
    })
  }

  return { centerStocks, products, barcodeMap }
}

// ─── 이지어드민 어드민상품매출통계 → 기간합계 판매 집계 ────────────
export function parseAdminSalesPeriod(
  rows: ParsedRow[],
  mapping: ColumnMapping,
  periodStart: string,
  periodEnd: string,
  barcodeMap: Record<string, string>
): PeriodSaleAggregate[] {
  const start = parseISO(periodStart)
  const end = parseISO(periodEnd)
  const periodDays = Math.max(1, differenceInDays(end, start) + 1)
  const result: PeriodSaleAggregate[] = []

  for (const row of rows) {
    let productId = row[mapping.productId]?.trim()
    // 상품코드가 없으면 바코드로 resolve
    if (!productId && mapping.barcode) {
      const barcode = row[mapping.barcode]?.trim()
      if (barcode) productId = barcodeMap[barcode] ?? barcode
    }
    if (!productId) continue

    const onlineQty = toInt(row[mapping.qty])
    const offlineQty = mapping.offlineQty ? toInt(row[mapping.offlineQty]) : 0

    if (onlineQty > 0) {
      result.push({
        productId,
        channel: 'online',
        periodStart,
        periodEnd,
        periodDays,
        totalQty: onlineQty,
        dailyVelocity: onlineQty / periodDays,
      })
    }
    if (offlineQty > 0) {
      result.push({
        productId,
        channel: 'offline',
        periodStart,
        periodEnd,
        periodDays,
        totalQty: offlineQty,
        dailyVelocity: offlineQty / periodDays,
      })
    }
  }

  return result
}

// ─── 이지체인 파일 형식 감지 ─────────────────────────────────────
// 매장이 컬럼으로 펼쳐진 피벗 형태: OF1_원주중앙점, OF2_xxx점 ...
// OF5_, OFH_, OFN_, OFZ_ 등 영문2~3자 + 영숫자1자 + 언더스코어 패턴
const STORE_COL_PATTERN = /^[A-Z]{2,3}[A-Z0-9]_/
const NON_STORE_COLS = new Set([
  '공급처', '상품코드', '카테고리', '등록일', '상품명', '옵션',
  '원가', '판매가격', '공급가', '접수', '송장',
  '본사+매장+이동중', '이동중', '매장원가금액', '매장판매가금액',
])

export function detectStoreFormat(headers: string[]): 'wide' | 'long' {
  return headers.some((h) => STORE_COL_PATTERN.test(h.trim())) ? 'wide' : 'long'
}

export function getStoreColumns(headers: string[]): string[] {
  const byCols = headers.filter((h) => STORE_COL_PATTERN.test(h.trim()))
  if (byCols.length > 0) return byCols
  // fallback: 고정 컬럼 제외
  return headers.filter((h) => !NON_STORE_COLS.has(h.trim()) && !h.includes('금액') && !h.includes('가격'))
}

// 피벗(Wide) 형태: 매장명이 컬럼 헤더로 펼쳐진 이지체인 재고 파싱
export function parseStoreStockWide(rows: ParsedRow[], headers: string[]): StoreStock[] {
  const now = new Date().toISOString()
  const storeCols = getStoreColumns(headers)
  const result: StoreStock[] = []
  for (const row of rows) {
    const productId = (row['상품코드'] ?? '').trim()
    if (!productId) continue
    for (const col of storeCols) {
      const qty = toInt(row[col])
      if (qty <= 0) continue
      result.push({ storeId: col, productId, qty, updatedAt: now })
    }
  }
  return result
}

// ─── 이지체인 E200 판매현황 Wide 파싱 (매장 컬럼별 판매수량 집계) ───
export function parseChainSalesWide(
  rows: ParsedRow[],
  headers: string[],
  periodStart: string,
  periodEnd: string
): PeriodSaleAggregate[] {
  const storeCols = getStoreColumns(headers)
  const start = parseISO(periodStart)
  const end = parseISO(periodEnd)
  const periodDays = Math.max(1, differenceInDays(end, start) + 1)

  // productId별, 매장별 합산
  const byProduct = new Map<string, number>()

  for (const row of rows) {
    const productId = (row['상품코드'] ?? '').trim()
    if (!productId) continue
    for (const col of storeCols) {
      const qty = toInt(row[col])
      if (qty <= 0) continue
      byProduct.set(productId, (byProduct.get(productId) ?? 0) + qty)
    }
  }

  return [...byProduct.entries()].map(([productId, totalQty]) => ({
    productId,
    channel: 'offline' as const,
    periodStart,
    periodEnd,
    periodDays,
    totalQty,
    dailyVelocity: totalQty / periodDays,
  }))
}

// ─── 이지체인 매장별 재고 파싱 (Long 형태) ───────────────────────
export function parseStoreStock(rows: ParsedRow[], mapping: ColumnMapping): StoreStock[] {
  const now = new Date().toISOString()
  return rows
    .map((row) => ({
      storeId: (mapping.storeId ? row[mapping.storeId]?.trim() : undefined) ?? '',
      productId: row[mapping.productId]?.trim() ?? '',
      qty: toInt(row[mapping.qty]),
      updatedAt: now,
    }))
    .filter((r) => r.productId && r.storeId)
}

// ─── 이지체인 매장 판매 파싱 (날짜별 행이 있는 경우) ──────────────
export function parseStoreSalesPeriod(
  rows: ParsedRow[],
  mapping: ColumnMapping,
  periodStart: string,
  periodEnd: string
): PeriodSaleAggregate[] {
  const start = parseISO(periodStart)
  const end = parseISO(periodEnd)
  const periodDays = Math.max(1, differenceInDays(end, start) + 1)
  const result: PeriodSaleAggregate[] = []

  for (const row of rows) {
    const productId = row[mapping.productId]?.trim()
    if (!productId) continue
    const qty = toInt(row[mapping.qty])
    if (qty <= 0) continue
    result.push({
      productId,
      channel: 'offline',
      periodStart,
      periodEnd,
      periodDays,
      totalQty: qty,
      dailyVelocity: qty / periodDays,
    })
  }
  return result
}

// ─── 쿠팡 판매 파싱 ──────────────────────────────────────────────
export function parseCoupangSales(
  rows: ParsedRow[],
  mapping: ColumnMapping,
  periodStart: string,
  periodEnd: string,
  barcodeMap: Record<string, string>
): PeriodSaleAggregate[] {
  const start = parseISO(periodStart)
  const end = parseISO(periodEnd)
  const periodDays = Math.max(1, differenceInDays(end, start) + 1)

  // 바코드별로 합산
  const byProduct = new Map<string, number>()

  for (const row of rows) {
    // 쿠팡은 바코드가 키
    const barcodeRaw = mapping.barcode
      ? row[mapping.barcode]?.trim()
      : row[mapping.productId]?.trim()
    if (!barcodeRaw) continue
    const productId = barcodeMap[barcodeRaw] ?? barcodeRaw
    const qty = toInt(row[mapping.qty])
    if (qty <= 0) continue
    byProduct.set(productId, (byProduct.get(productId) ?? 0) + qty)
  }

  return [...byProduct.entries()].map(([productId, totalQty]) => ({
    productId,
    channel: 'coupang' as const,
    periodStart,
    periodEnd,
    periodDays,
    totalQty,
    dailyVelocity: totalQty / periodDays,
  }))
}

// ─── 구글 시트 CSV URL 가져오기 ──────────────────────────────────
export async function fetchGoogleSheetCSV(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`CSV 가져오기 실패: ${res.status}`)
  return res.text()
}

// ─── 자동 컬럼 매핑 추론 ─────────────────────────────────────────
const PRODUCT_ID_CANDIDATES = [
  '상품코드', '품목코드', 'SKU', 'productId', 'product_id', '상품번호', '코드',
]
const BARCODE_CANDIDATES = [
  '바코드', 'barcode', 'EAN', 'UPC',
]
const PRODUCT_NAME_CANDIDATES = [
  '상품명', '품목명', '제품명', 'productName', 'name',
]
const STORE_ID_CANDIDATES = [
  '매장코드', '점포코드', '매장ID', 'storeId', 'store_id', '매장번호',
]
const STORE_NAME_CANDIDATES = [
  '매장명', '점포명', 'storeName',
]
// 재고 수량: 가용재고 우선 (이지어드민 기준)
const QTY_CANDIDATES = [
  '가용재고', '재고수량', '재고', '수량', '판매수량', 'qty', 'quantity',
  '온라인판매수량', '잔여수량', '출고수량', '실판매수량',
]
const OFFLINE_QTY_CANDIDATES = [
  '매장판매수량', '매장판매', '오프라인판매수량',
]
const DATE_CANDIDATES = [
  '날짜', '일자', '판매일', '기준일', 'date', '거래일',
]
const REVENUE_CANDIDATES = [
  '금액', '판매금액', '매출', 'revenue', 'amount', '공급가',
]
const CATEGORY_CANDIDATES = [
  '카테고리', '복종(대카테고리)', '복종', '대카테고리', 'category',
]
const SEASON_CANDIDATES = [
  '시즌', '시즌코드', 'season',
]
const COLOR_CANDIDATES = [
  '옵션', '색상', '컬러', 'color', '색', '옵션명',
]
const SIZE_CANDIDATES = [
  '사이즈', '치수', 'size', '규격', '호수', '사이즈코드',
]
const IMAGE_CANDIDATES = [
  '이미지URL', '이미지 URL', 'imageUrl', 'image_url',
]

function findCol(headers: string[], candidates: string[]): string {
  for (const c of candidates) {
    const found = headers.find((h) => h.trim() === c)
    if (found) return found
  }
  // 부분 매칭 fallback
  for (const c of candidates) {
    const found = headers.find((h) => h.trim().includes(c))
    if (found) return found
  }
  return ''
}

export function inferColumnMapping(
  headers: string[],
  sourceType: DataSourceType
): Partial<ColumnMapping> {
  const isStore = sourceType === 'chain_store'
  const isSales = sourceType === 'admin_sales'
  const isCoupang = sourceType === 'coupang'

  return {
    productId: findCol(headers, PRODUCT_ID_CANDIDATES),
    barcode: findCol(headers, BARCODE_CANDIDATES),
    productName: findCol(headers, PRODUCT_NAME_CANDIDATES),
    storeId: isStore ? findCol(headers, STORE_ID_CANDIDATES) : undefined,
    storeName: isStore ? findCol(headers, STORE_NAME_CANDIDATES) : undefined,
    qty: isCoupang
      ? findCol(headers, ['출고수량', '판매수량', '수량', 'qty', 'quantity'])
      : findCol(headers, QTY_CANDIDATES),
    offlineQty: isSales ? findCol(headers, OFFLINE_QTY_CANDIDATES) : undefined,
    date: findCol(headers, DATE_CANDIDATES),
    revenue: findCol(headers, REVENUE_CANDIDATES),
    category: findCol(headers, CATEGORY_CANDIDATES),
    season: findCol(headers, SEASON_CANDIDATES),
    color: findCol(headers, COLOR_CANDIDATES),
    size: findCol(headers, SIZE_CANDIDATES),
    imageUrl: findCol(headers, IMAGE_CANDIDATES),
  }
}

// ─── 이지체인 Wide / 이지어드민 파일에서 상품 옵션 정보 추출 ────────
// parseStoreStockWide는 재고만 반환하므로, 상품명·옵션 정보를 별도로 추출
// findCol을 사용해 '옵션', '색상', '컬러' 등 다양한 컬럼명을 유연하게 탐색
export function extractProductInfoFromStoreWide(
  rows: ParsedRow[],
  headers: string[],
): Pick<Product, 'id' | 'name' | 'category' | 'season' | 'color'>[] {
  const optionCol  = findCol(headers, COLOR_CANDIDATES)      // '옵션', '색상', '컬러' 등
  const nameCol    = findCol(headers, PRODUCT_NAME_CANDIDATES) // '상품명'
  const catCol     = findCol(headers, CATEGORY_CANDIDATES)
  // 이름 매칭 우선, 없으면 값 패턴으로 감지 (이지어드민 '상품추가항목3' 등)
  const seasonCol  = findCol(headers, SEASON_CANDIDATES) || detectSeasonColumnFromData(headers, rows)
  const idCol      = findCol(headers, PRODUCT_ID_CANDIDATES)  // '상품코드'

  const seen = new Set<string>()
  const result: Pick<Product, 'id' | 'name' | 'category' | 'season' | 'color'>[] = []

  for (const row of rows) {
    const productId = idCol ? (row[idCol] ?? '').trim() : (row['상품코드'] ?? '').trim()
    if (!productId || seen.has(productId)) continue
    seen.add(productId)

    result.push({
      id: productId,
      name: nameCol ? (row[nameCol]?.trim() ?? productId) : productId,
      category: catCol ? (row[catCol]?.trim() ?? '') : '',
      season: seasonCol ? (row[seasonCol]?.trim() ?? '') : '',
      color: optionCol ? (row[optionCol]?.trim() || undefined) : undefined,
    })
  }

  return result
}

// ─── 값 패턴 기반 시즌 컬럼 자동 감지 ──────────────────────────────
// 이지어드민은 시즌을 '상품추가항목3' 같은 이름에 저장하므로
// 이름 매칭이 아니라 값 패턴으로 컬럼을 찾는다:
//   영문 코드: "2025SS", "2026FW" 등
//   한글 값:   "봄", "여름", "가을", "겨울", "봄/가을", "사계절" 등
const SEASON_VALUE_RE = /^20\d{2}(SS|FW|SP|FA|SU|AU|WI)$/i
const KOREAN_SEASON_RE = /^(봄|여름|가을|겨울|사계절)(\/?(봄|여름|가을|겨울))*$/

function isSeasonValue(v: string): boolean {
  return SEASON_VALUE_RE.test(v) || KOREAN_SEASON_RE.test(v)
}

export function detectSeasonColumnFromData(headers: string[], rows: ParsedRow[]): string {
  const sample = rows.slice(0, 30)
  for (const h of headers) {
    const nonEmpty = sample.filter((r) => (r[h]?.trim() ?? '').length > 0)
    if (nonEmpty.length === 0) continue
    const matchCount = nonEmpty.filter((r) => isSeasonValue(r[h]?.trim() ?? '')).length
    // 비어있지 않은 셀 중 30% 이상이 시즌 패턴이면 해당 컬럼을 시즌으로 판정
    if (matchCount >= Math.max(1, Math.floor(nonEmpty.length * 0.3))) return h
  }
  return ''
}

// ─── 기존 호환: 일별 판매 파싱 (날짜 컬럼이 있는 경우) ────────────
export function parseSales(
  rows: ParsedRow[],
  mapping: ColumnMapping,
  channel: 'online' | 'offline' | 'coupang',
  defaultStoreId?: string
): SaleRecord[] {
  return rows.flatMap((row) => {
    const productId = row[mapping.productId]?.trim()
    if (!productId) return []
    const dateStr = mapping.date ? normalizeDate(row[mapping.date]) : null
    if (!dateStr) return []
    const qty = toInt(row[mapping.qty])
    const revenue = toFloat(row[mapping.revenue ?? ''])
    if (qty === 0) return []
    return [{
      date: dateStr,
      productId,
      channel,
      storeId: mapping.storeId ? row[mapping.storeId]?.trim() : defaultStoreId,
      qty,
      revenue,
    } as SaleRecord]
  })
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null
  const clean = raw.trim().replace(/\./g, '-').replace(/\//g, '-')
  if (/^\d{8}$/.test(clean)) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    return clean.slice(0, 10)
  }
  return null
}

// ─── 센터 재고만 파싱 (호환용) ──────────────────────────────────
export function parseCenterStock(rows: ParsedRow[], mapping: ColumnMapping): CenterStock[] {
  const now = new Date().toISOString()
  return rows
    .map((row) => ({
      productId: row[mapping.productId]?.trim() ?? '',
      qty: toInt(row[mapping.qty]),
      updatedAt: now,
    }))
    .filter((r) => r.productId)
}
