/**
 * 쿠팡 Wing 자동 스크래퍼
 *
 * URL: https://wing.coupang.com
 * 다운로드: 판매 내역 (기간별 바코드별 수량)
 *
 * 쿠팡 Wing은 UI가 비교적 안정적이므로 셀렉터 정확도가 높습니다.
 * 단, 쿠팡 측 UI 변경 시 업데이트 필요.
 */

import { type Page } from 'playwright'
import { getBrowser, waitForDownload, getPeriodDates, log } from './base.js'
import { config } from '../config.js'

const WING_BASE = 'https://wing.coupang.com'

const SELECTORS = {
  login: {
    idInput: '#username',
    pwInput: '#password',
    submitBtn: 'button[type="submit"], .btn-login',
    successIndicator: '.gnb-menu, .wing-gnb, [class*="header"]',
  },
  sales: {
    // 판매 내역 페이지 (정산 > 판매 내역 또는 상품 관리 > 판매 현황)
    // 실제 URL 경로를 직접 이동
    pageUrl: `${WING_BASE}/seller/sales-report`,
    startDateInput: '[data-testid="start-date"], input[name="startDate"], .date-picker:first-child input',
    endDateInput: '[data-testid="end-date"], input[name="endDate"], .date-picker:last-child input',
    searchBtn: 'button:has-text("조회"), button[type="submit"]:near(.date-picker)',
    downloadBtn: 'button:has-text("다운로드"), button:has-text("엑셀"), [data-testid="download"]',
    // 로딩 완료 판단
    tableSelector: 'table tbody tr, [class*="table"] [class*="row"]',
  },
}

export interface CoupangResult {
  salesFilePath: string
  periodStart: string
  periodEnd: string
}

export async function scrapeCoupang(): Promise<CoupangResult> {
  const { start, end } = getPeriodDates()
  log('쿠팡 Wing', `스크래핑 시작 (${start} ~ ${end})`)

  const browser = await getBrowser()
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()

  try {
    // ── 1. 로그인 ────────────────────────────────────────────────
    log('쿠팡 Wing', '로그인 중...')
    await page.goto(`${WING_BASE}/login`, { waitUntil: 'domcontentloaded' })

    // 쿠팡은 로그인 페이지가 리다이렉트될 수 있음
    await page.waitForLoadState('networkidle')

    if (page.url().includes('login') || page.url().includes('accounts')) {
      await page.fill(SELECTORS.login.idInput, config.coupang.id)
      await page.fill(SELECTORS.login.pwInput, config.coupang.pw)
      await page.click(SELECTORS.login.submitBtn)
      await page.waitForURL((url) => !url.includes('login'), { timeout: 20_000 })
      log('쿠팡 Wing', '로그인 성공')
    } else {
      log('쿠팡 Wing', '이미 로그인 상태')
    }

    // ── 2. 판매 내역 페이지 이동 ─────────────────────────────────
    log('쿠팡 Wing', '판매 내역 조회 중...')
    await page.goto(SELECTORS.sales.pageUrl, { waitUntil: 'networkidle' })

    // 날짜 범위 입력
    await setDateRange(page, start, end)

    // 조회
    await page.click(SELECTORS.sales.searchBtn)
    await page.waitForSelector(SELECTORS.sales.tableSelector, { timeout: 30_000 })

    const salesFilePath = await waitForDownload(context, async () => {
      await page.click(SELECTORS.sales.downloadBtn)
    })

    log('쿠팡 Wing', '완료')
    return { salesFilePath, periodStart: start, periodEnd: end }
  } catch (err) {
    const screenshotPath = `${config.downloadDir}/error-coupang-${Date.now()}.png`
    await page.screenshot({ path: screenshotPath }).catch(() => {})
    log('쿠팡 Wing', `오류 발생 (스크린샷: ${screenshotPath}): ${err}`)
    throw err
  } finally {
    await context.close()
  }
}

// ─── 날짜 입력 헬퍼 ──────────────────────────────────────────────
// 쿠팡 Wing은 date-picker가 있어서 직접 입력이 까다로울 수 있음
async function setDateRange(page: Page, start: string, end: string) {
  try {
    // 방법 1: input에 직접 입력
    await page.fill(SELECTORS.sales.startDateInput, start)
    await page.keyboard.press('Tab')
    await page.fill(SELECTORS.sales.endDateInput, end)
    await page.keyboard.press('Tab')
  } catch {
    // 방법 2: JavaScript로 값 강제 입력
    await page.evaluate(
      ({ sel, val }) => {
        const el = document.querySelector(sel) as HTMLInputElement
        if (el) {
          el.value = val
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
      },
      { sel: SELECTORS.sales.startDateInput, val: start }
    )
    await page.evaluate(
      ({ sel, val }) => {
        const el = document.querySelector(sel) as HTMLInputElement
        if (el) {
          el.value = val
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
      },
      { sel: SELECTORS.sales.endDateInput, val: end }
    )
  }
}
