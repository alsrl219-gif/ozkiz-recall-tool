/**
 * 앱 설정 페이지 ↔ 서버 연동 API
 *
 * POST /api/config        → 셀렉터/계정 설정 저장
 * GET  /api/config        → 현재 설정 반환 (비밀번호 마스킹)
 * GET  /api/test/:site    → 해당 사이트 접속 후 스크린샷 반환
 */

import { type Router } from 'express'
import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(__dirname, '../../config.json')

// ─── 설정 타입 ───────────────────────────────────────────────────
export interface SiteConfig {
  url?: string
  id?: string
  pw?: string
  // 셀렉터 (버튼 텍스트로 자동 생성)
  loginIdSelector?: string
  loginPwSelector?: string
  loginBtnText?: string
  stockMenuText?: string
  stockDownloadText?: string
  salesMenuText?: string
  salesDownloadText?: string
  storeMenuText?: string
  storeDownloadText?: string
}

export interface AutoConfig {
  ezadmin?: SiteConfig
  ezchain?: SiteConfig
  coupang?: SiteConfig
  scheduleHour?: number   // 자동 실행 시각 (0~23)
  periodDays?: number
}

// ─── 설정 읽기/쓰기 ──────────────────────────────────────────────
export function readConfig(): AutoConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return {}
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as AutoConfig
  } catch {
    return {}
  }
}

export function writeConfig(config: AutoConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

// 비밀번호 마스킹
function maskConfig(cfg: AutoConfig): AutoConfig {
  return JSON.parse(JSON.stringify(cfg, (key, val) => {
    if (key === 'pw' && typeof val === 'string') return val ? '••••••' : ''
    return val
  }))
}

// ─── 스크린샷 테스트 ─────────────────────────────────────────────
async function takeScreenshot(url: string, id?: string, pw?: string): Promise<string> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})

    // 로그인 시도 (아이디/비밀번호가 있는 경우)
    if (id && pw) {
      // 일반적인 input 필드 찾기
      const idInput = page.locator(
        'input[type="text"], input[name*="id"], input[name*="user"], input[placeholder*="아이디"]'
      ).first()
      const pwInput = page.locator('input[type="password"]').first()

      if (await idInput.isVisible().catch(() => false)) {
        await idInput.fill(id)
        await pwInput.fill(pw)
        // 로그인 버튼 클릭
        const loginBtn = page.locator(
          'button[type="submit"], input[type="submit"], button:has-text("로그인"), button:has-text("확인")'
        ).first()
        if (await loginBtn.isVisible().catch(() => false)) {
          await loginBtn.click()
          await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
        }
      }
    }

    const screenshot = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: false })
    return `data:image/jpeg;base64,${screenshot.toString('base64')}`
  } finally {
    await browser.close()
  }
}

// ─── 라우터 등록 ────────────────────────────────────────────────
export function registerConfigRoutes(router: Router) {
  // 현재 설정 반환 (비밀번호 마스킹)
  router.get('/config', (_req, res) => {
    res.json(maskConfig(readConfig()))
  })

  // 설정 저장
  router.post('/config', (req, res) => {
    try {
      const current = readConfig()
      const updated: AutoConfig = { ...current, ...req.body }
      // 비밀번호 마스킹된 값이 들어오면 기존 값 유지
      for (const site of ['ezadmin', 'ezchain', 'coupang'] as const) {
        if (updated[site]?.pw === '••••••') {
          updated[site]!.pw = current[site]?.pw ?? ''
        }
      }
      writeConfig(updated)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ error: String(e) })
    }
  })

  // 사이트 접속 테스트 + 스크린샷
  router.get('/test/:site', async (req, res) => {
    const site = req.params.site as 'ezadmin' | 'ezchain' | 'coupang'
    const cfg = readConfig()
    const siteCfg = cfg[site]

    const urls: Record<string, string> = {
      coupang: 'https://wing.coupang.com/login',
    }

    const url = siteCfg?.url ?? urls[site]
    if (!url) {
      return res.status(400).json({ error: `${site} URL이 설정되지 않았습니다` })
    }

    try {
      const screenshot = await takeScreenshot(url, siteCfg?.id, siteCfg?.pw)
      res.json({ ok: true, screenshot, url })
    } catch (e) {
      res.status(500).json({ error: `접속 실패: ${e}` })
    }
  })
}
