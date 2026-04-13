/**
 * 전체 스크래핑 실행 + 데이터 처리 파이프라인
 *
 * 실행 순서:
 *   1. 이지어드민 현재고 → 센터 재고 + 바코드맵
 *   2. 이지어드민 판매통계 → 온라인/오프라인 판매 집계
 *   3. 이지체인 → 매장별 재고
 *   4. 쿠팡 Wing → 쿠팡 판매 집계
 *   5. 결과 병합 → latest.json 저장
 */

import { scrapeEzAdmin } from './ezadmin.js'
import { scrapeEzChain } from './ezchain.js'
import { scrapeCoupang } from './coupang.js'
import { processAllFiles } from '../processor.js'
import { saveData } from '../data-store.js'
import { closeBrowser, log } from './base.js'

export interface ScrapeResult {
  success: boolean
  completedAt: string
  errors: string[]
}

export async function runAllScrapers(): Promise<ScrapeResult> {
  const errors: string[] = []
  const files: Parameters<typeof processAllFiles>[0] = {}

  log('전체', '== 자동 데이터 수집 시작 ==')

  // ── 1·2. 이지어드민 ──────────────────────────────────────────
  try {
    const result = await scrapeEzAdmin()
    files.adminStock = result.stockFilePath
    files.adminSales = result.salesFilePath
    files.adminSalesPeriodStart = result.periodStart
    files.adminSalesPeriodEnd = result.periodEnd
  } catch (err) {
    errors.push(`이지어드민: ${err}`)
    log('전체', `이지어드민 스킵 (오류): ${err}`)
  }

  // ── 3. 이지체인 ──────────────────────────────────────────────
  try {
    const result = await scrapeEzChain()
    files.chainStore = result.stockFilePath
  } catch (err) {
    errors.push(`이지체인: ${err}`)
    log('전체', `이지체인 스킵 (오류): ${err}`)
  }

  // ── 4. 쿠팡 ─────────────────────────────────────────────────
  try {
    const result = await scrapeCoupang()
    files.coupangSales = result.salesFilePath
    files.coupangPeriodStart = result.periodStart
    files.coupangPeriodEnd = result.periodEnd
  } catch (err) {
    errors.push(`쿠팡: ${err}`)
    log('전체', `쿠팡 스킵 (오류): ${err}`)
  }

  // ── 5. 처리 + 저장 ───────────────────────────────────────────
  if (Object.keys(files).length > 0) {
    try {
      const processed = await processAllFiles(files)
      await saveData(processed)
      log('전체', `데이터 저장 완료 (오류 ${errors.length}건)`)
    } catch (err) {
      errors.push(`데이터 처리: ${err}`)
      log('전체', `데이터 처리 실패: ${err}`)
    }
  }

  await closeBrowser()

  const result: ScrapeResult = {
    success: errors.length === 0,
    completedAt: new Date().toISOString(),
    errors,
  }

  log('전체', `== 완료 (성공: ${result.success}) ==`)
  return result
}

// ─── 직접 실행 시 ────────────────────────────────────────────────
// tsx src/scrapers/index.ts
if (process.argv[1].includes('scrapers/index')) {
  runAllScrapers()
    .then((r) => {
      if (!r.success) {
        console.error('오류:', r.errors)
        process.exit(1)
      }
    })
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
