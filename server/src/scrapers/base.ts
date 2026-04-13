import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import fs from 'fs'
import path from 'path'
import { config } from '../config.js'

let browser: Browser | null = null

export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
  return browser
}

export async function closeBrowser() {
  if (browser) {
    await browser.close()
    browser = null
  }
}

// ─── 파일 다운로드 헬퍼 ──────────────────────────────────────────
export async function waitForDownload(
  context: BrowserContext,
  action: () => Promise<void>
): Promise<string> {
  const downloadPromise = context.waitForEvent('download', { timeout: 60_000 })
  await action()
  const download = await downloadPromise

  const filename = download.suggestedFilename()
  const savePath = path.join(config.downloadDir, filename)
  fs.mkdirSync(config.downloadDir, { recursive: true })
  await download.saveAs(savePath)
  console.log(`  ↓ 다운로드 완료: ${filename}`)
  return savePath
}

// ─── 날짜 범위 계산 ─────────────────────────────────────────────
export function getPeriodDates(days = config.analysisPeriodDays) {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - days)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: fmt(start), end: fmt(end) }
}

// ─── 로그 헬퍼 ──────────────────────────────────────────────────
export function log(site: string, msg: string) {
  console.log(`[${new Date().toLocaleTimeString('ko-KR')}] [${site}] ${msg}`)
}
