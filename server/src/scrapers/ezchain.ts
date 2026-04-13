/**
 * 이지체인 자동 스크래퍼
 *
 * 다운로드 항목:
 *   - 매장별 현재 재고 (상품코드 기준)
 *
 * ⚠️  SELECTOR 설정 필요
 */

import { getBrowser, waitForDownload, log } from './base.js'
import { config } from '../config.js'

const SELECTORS = {
  login: {
    idInput: 'input[name="userId"], input[type="text"]',
    pwInput: 'input[name="userPw"], input[type="password"]',
    submitBtn: 'button[type="submit"], input[type="submit"]',
    successIndicator: '.menu, .nav, .sidebar',
  },
  stock: {
    menuLink: 'a:has-text("재고"), a:has-text("매장재고"), a[href*="stock"]',
    searchBtn: 'button:has-text("조회"), button:has-text("검색")',
    downloadBtn: 'button:has-text("다운로드"), button:has-text("엑셀"), button:has-text("CSV")',
  },
}

export interface EzChainResult {
  stockFilePath: string
}

export async function scrapeEzChain(): Promise<EzChainResult> {
  log('이지체인', '스크래핑 시작')

  const browser = await getBrowser()
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()

  try {
    // ── 1. 로그인 ────────────────────────────────────────────────
    log('이지체인', '로그인 중...')
    await page.goto(config.ezchain.url, { waitUntil: 'domcontentloaded' })
    await page.fill(SELECTORS.login.idInput, config.ezchain.id)
    await page.fill(SELECTORS.login.pwInput, config.ezchain.pw)
    await page.click(SELECTORS.login.submitBtn)
    await page.waitForSelector(SELECTORS.login.successIndicator, { timeout: 15_000 })
    log('이지체인', '로그인 성공')

    // ── 2. 매장 재고 다운로드 ────────────────────────────────────
    log('이지체인', '매장 재고 조회 중...')
    await page.click(SELECTORS.stock.menuLink)
    await page.waitForLoadState('networkidle')
    await page.click(SELECTORS.stock.searchBtn)
    await page.waitForLoadState('networkidle')

    const stockFilePath = await waitForDownload(context, async () => {
      await page.click(SELECTORS.stock.downloadBtn)
    })

    log('이지체인', '완료')
    return { stockFilePath }
  } catch (err) {
    const screenshotPath = `${config.downloadDir}/error-ezchain-${Date.now()}.png`
    await page.screenshot({ path: screenshotPath }).catch(() => {})
    log('이지체인', `오류 발생 (스크린샷: ${screenshotPath}): ${err}`)
    throw err
  } finally {
    await context.close()
  }
}
