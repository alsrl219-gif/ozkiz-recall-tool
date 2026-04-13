/**
 * 이지어드민 자동 스크래퍼
 *
 * 다운로드 항목:
 *   1. 현재고조회  → 센터 가용재고 + 바코드 매핑
 *   2. 어드민상품매출통계 → 기간별 온라인/매장 판매 합계
 *
 * ⚠️  SELECTOR 설정 필요:
 *   아래 SELECTORS 객체의 값들은 실제 이지어드민 페이지를 열어
 *   브라우저 개발자 도구(F12) → Elements 탭에서 확인 후 채워주세요.
 *   또는 `npm run scrape -- --record` 로 녹화 모드 실행.
 */

import { getBrowser, waitForDownload, getPeriodDates, log } from './base.js'
import { config } from '../config.js'

// ── 실제 이지어드민 셀렉터를 여기에 채워주세요 ──────────────────
const SELECTORS = {
  // 로그인 페이지
  login: {
    idInput: 'input[name="userId"]',          // 아이디 입력란
    pwInput: 'input[name="userPw"]',          // 비밀번호 입력란
    submitBtn: 'button[type="submit"]',        // 로그인 버튼
    successIndicator: '.gnb-menu, .main-menu', // 로그인 성공 후 나타나는 요소
  },

  // 현재고조회 메뉴
  stock: {
    menuLink: 'a[href*="stock"], a:has-text("현재고")',  // 메뉴 링크
    searchBtn: 'button:has-text("조회"), button:has-text("검색")',
    downloadBtn: 'button:has-text("다운로드"), a:has-text("엑셀"), button:has-text("CSV")',
    loadingIndicator: '.loading, .spinner',    // 로딩 완료 대기용
  },

  // 어드민상품매출통계 메뉴
  sales: {
    menuLink: 'a[href*="sales"], a:has-text("매출통계"), a:has-text("판매통계")',
    startDateInput: 'input[name="startDate"], input[placeholder*="시작"]',
    endDateInput: 'input[name="endDate"], input[placeholder*="종료"]',
    searchBtn: 'button:has-text("조회"), button:has-text("검색")',
    downloadBtn: 'button:has-text("다운로드"), a:has-text("엑셀"), button:has-text("CSV")',
  },
}

export interface EzAdminResult {
  stockFilePath: string
  salesFilePath: string
  periodStart: string
  periodEnd: string
}

export async function scrapeEzAdmin(): Promise<EzAdminResult> {
  const { start, end } = getPeriodDates()
  log('이지어드민', `스크래핑 시작 (${start} ~ ${end})`)

  const browser = await getBrowser()
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()

  try {
    // ── 1. 로그인 ────────────────────────────────────────────────
    log('이지어드민', '로그인 중...')
    await page.goto(config.ezadmin.url, { waitUntil: 'domcontentloaded' })
    await page.fill(SELECTORS.login.idInput, config.ezadmin.id)
    await page.fill(SELECTORS.login.pwInput, config.ezadmin.pw)
    await page.click(SELECTORS.login.submitBtn)
    await page.waitForSelector(SELECTORS.login.successIndicator, { timeout: 15_000 })
    log('이지어드민', '로그인 성공')

    // ── 2. 현재고조회 다운로드 ───────────────────────────────────
    log('이지어드민', '현재고 조회 중...')
    await page.click(SELECTORS.stock.menuLink)
    await page.waitForLoadState('networkidle')

    // 조회 버튼 클릭 후 데이터 로드 대기
    await page.click(SELECTORS.stock.searchBtn)
    await page.waitForLoadState('networkidle')

    const stockFilePath = await waitForDownload(context, async () => {
      await page.click(SELECTORS.stock.downloadBtn)
    })

    // ── 3. 어드민상품매출통계 다운로드 ──────────────────────────
    log('이지어드민', '판매 통계 조회 중...')
    await page.click(SELECTORS.sales.menuLink)
    await page.waitForLoadState('networkidle')

    // 날짜 범위 입력
    await page.fill(SELECTORS.sales.startDateInput, start.replace(/-/g, '.'))
    await page.fill(SELECTORS.sales.endDateInput, end.replace(/-/g, '.'))
    await page.click(SELECTORS.sales.searchBtn)
    await page.waitForLoadState('networkidle')

    const salesFilePath = await waitForDownload(context, async () => {
      await page.click(SELECTORS.sales.downloadBtn)
    })

    log('이지어드민', '완료')
    return { stockFilePath, salesFilePath, periodStart: start, periodEnd: end }
  } catch (err) {
    const screenshotPath = `${config.downloadDir}/error-ezadmin-${Date.now()}.png`
    await page.screenshot({ path: screenshotPath }).catch(() => {})
    log('이지어드민', `오류 발생 (스크린샷: ${screenshotPath}): ${err}`)
    throw err
  } finally {
    await context.close()
  }
}
