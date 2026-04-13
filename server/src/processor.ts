/**
 * CSV 파일 → 앱 데이터 형식 변환
 * React 앱의 csvParser.ts 로직을 Node.js 환경에서 재사용
 */

import fs from 'fs'
import Papa from 'papaparse'
import { differenceInDays, parseISO } from 'date-fns'

export interface ProcessedData {
  centerStocks: Array<{ productId: string; qty: number; updatedAt: string }>
  storeStocks: Array<{ storeId: string; productId: string; qty: number; updatedAt: string }>
  periodSales: Array<{
    productId: string
    channel: 'online' | 'offline' | 'coupang'
    periodStart: string
    periodEnd: string
    periodDays: number
    totalQty: number
    dailyVelocity: number
  }>
  products: Array<{
    id: string
    name: string
    category: string
    season: string
    imageUrl?: string
  }>
  barcodeMap: Record<string, string>
  processedAt: string
}

type Row = Record<string, string>

function readCSV(filePath: string): Row[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const result = Papa.parse<Row>(content, { header: true, skipEmptyLines: true })
  return result.data
}

function toInt(v: string | undefined): number {
  return parseInt((v ?? '0').replace(/,/g, ''), 10) || 0
}

function findCol(row: Row, candidates: string[]): string {
  for (const c of candidates) {
    if (row[c] !== undefined) return c
  }
  return ''
}

// 첫 행에서 컬럼명 자동 추론
function inferCols(headers: string[]) {
  const find = (candidates: string[]) => {
    for (const c of candidates) {
      const found = headers.find(h => h.trim() === c || h.includes(c))
      if (found) return found
    }
    return ''
  }
  return {
    productId: find(['상품코드', 'SKU', 'product_id']),
    barcode: find(['바코드', 'barcode', 'EAN']),
    name: find(['상품명', 'product_name', 'name']),
    category: find(['카테고리', '복종(대카테고리)', '복종', 'category']),
    season: find(['시즌', 'season']),
    imageUrl: find(['이미지URL', '이미지 URL', 'imageUrl']),
    qty: find(['가용재고', '재고수량', '수량', 'qty', 'quantity']),
    onlineQty: find(['온라인판매수량', '수량', 'online_qty']),
    offlineQty: find(['매장판매수량', '매장판매', 'offline_qty']),
    storeId: find(['매장코드', '점포코드', 'store_id']),
    storeName: find(['매장명', '점포명', 'store_name']),
  }
}

interface ScrapeFiles {
  adminStock?: string
  adminSales?: string
  adminSalesPeriodStart?: string
  adminSalesPeriodEnd?: string
  chainStore?: string
  chainSalesPeriodStart?: string
  chainSalesPeriodEnd?: string
  coupangSales?: string
  coupangPeriodStart?: string
  coupangPeriodEnd?: string
}

export async function processAllFiles(files: ScrapeFiles): Promise<ProcessedData> {
  const now = new Date().toISOString()
  const result: ProcessedData = {
    centerStocks: [],
    storeStocks: [],
    periodSales: [],
    products: [],
    barcodeMap: {},
    processedAt: now,
  }

  // ── 이지어드민 현재고 ────────────────────────────────────────
  if (files.adminStock) {
    const rows = readCSV(files.adminStock)
    if (rows.length === 0) return result
    const headers = Object.keys(rows[0])
    const cols = inferCols(headers)
    const productMap = new Map<string, ProcessedData['products'][0]>()

    for (const row of rows) {
      const productId = row[cols.productId]?.trim()
      if (!productId) continue

      result.centerStocks.push({
        productId,
        qty: toInt(row[cols.qty]),
        updatedAt: now,
      })

      const barcode = row[cols.barcode]?.trim()
      if (barcode) result.barcodeMap[barcode] = productId

      if (!productMap.has(productId)) {
        productMap.set(productId, {
          id: productId,
          name: row[cols.name]?.trim() ?? productId,
          category: row[cols.category]?.trim() ?? '',
          season: row[cols.season]?.trim() ?? '',
          imageUrl: row[cols.imageUrl]?.trim() || undefined,
        })
      }
    }
    result.products = [...productMap.values()]
    console.log(`  처리: 센터재고 ${result.centerStocks.length}종, 바코드맵 ${Object.keys(result.barcodeMap).length}건`)
  }

  // ── 이지어드민 판매통계 ──────────────────────────────────────
  if (files.adminSales && files.adminSalesPeriodStart && files.adminSalesPeriodEnd) {
    const rows = readCSV(files.adminSales)
    if (rows.length > 0) {
      const headers = Object.keys(rows[0])
      const cols = inferCols(headers)
      const periodDays = Math.max(1,
        differenceInDays(parseISO(files.adminSalesPeriodEnd), parseISO(files.adminSalesPeriodStart)) + 1
      )

      for (const row of rows) {
        let productId = row[cols.productId]?.trim()
        if (!productId) {
          const barcode = row[cols.barcode]?.trim()
          if (barcode) productId = result.barcodeMap[barcode] ?? barcode
        }
        if (!productId) continue

        const onlineQty = toInt(row[cols.onlineQty])
        const offlineQty = toInt(row[cols.offlineQty])

        if (onlineQty > 0) {
          result.periodSales.push({
            productId, channel: 'online',
            periodStart: files.adminSalesPeriodStart!,
            periodEnd: files.adminSalesPeriodEnd!,
            periodDays, totalQty: onlineQty,
            dailyVelocity: onlineQty / periodDays,
          })
        }
        if (offlineQty > 0) {
          result.periodSales.push({
            productId, channel: 'offline',
            periodStart: files.adminSalesPeriodStart!,
            periodEnd: files.adminSalesPeriodEnd!,
            periodDays, totalQty: offlineQty,
            dailyVelocity: offlineQty / periodDays,
          })
        }
      }
      console.log(`  처리: 판매통계 ${result.periodSales.length}건`)
    }
  }

  // ── 이지체인 매장 재고 ───────────────────────────────────────
  if (files.chainStore) {
    const rows = readCSV(files.chainStore)
    if (rows.length > 0) {
      const headers = Object.keys(rows[0])
      const cols = inferCols(headers)
      const storeSet = new Set<string>()

      for (const row of rows) {
        const productId = row[cols.productId]?.trim()
        const storeId = row[cols.storeId]?.trim()
        if (!productId || !storeId) continue
        result.storeStocks.push({
          storeId, productId,
          qty: toInt(row[cols.qty]),
          updatedAt: now,
        })
        storeSet.add(storeId)
      }
      console.log(`  처리: 매장재고 ${result.storeStocks.length}건 (${storeSet.size}개 매장)`)
    }
  }

  // ── 쿠팡 판매 ────────────────────────────────────────────────
  if (files.coupangSales && files.coupangPeriodStart && files.coupangPeriodEnd) {
    const rows = readCSV(files.coupangSales)
    if (rows.length > 0) {
      const headers = Object.keys(rows[0])
      const cols = inferCols(headers)
      const periodDays = Math.max(1,
        differenceInDays(parseISO(files.coupangPeriodEnd), parseISO(files.coupangPeriodStart)) + 1
      )
      const byProduct = new Map<string, number>()

      for (const row of rows) {
        const barcodeRaw = row[cols.barcode]?.trim() ?? row[cols.productId]?.trim()
        if (!barcodeRaw) continue
        const productId = result.barcodeMap[barcodeRaw] ?? barcodeRaw
        const qty = toInt(row[cols.qty] ? row[cols.qty] : (row['판매수량'] ?? '0'))
        if (qty > 0) byProduct.set(productId, (byProduct.get(productId) ?? 0) + qty)
      }

      for (const [productId, totalQty] of byProduct) {
        result.periodSales.push({
          productId, channel: 'coupang',
          periodStart: files.coupangPeriodStart!,
          periodEnd: files.coupangPeriodEnd!,
          periodDays, totalQty,
          dailyVelocity: totalQty / periodDays,
        })
      }
      console.log(`  처리: 쿠팡 판매 ${byProduct.size}종`)
    }
  }

  return result
}
