/**
 * 셀렉터 녹화 도구
 *
 * 실행: tsx src/selector-recorder.ts ezadmin
 *        tsx src/selector-recorder.ts coupang
 *
 * Playwright Inspector가 열리면 사이트를 직접 조작하면서
 * 각 요소의 셀렉터를 확인할 수 있습니다.
 */

import { chromium } from 'playwright'
import { config } from './config.js'

const target = process.argv[2] ?? 'ezadmin'
const urls: Record<string, string> = {
  ezadmin: config.ezadmin.url,
  ezchain: config.ezchain.url,
  coupang: 'https://wing.coupang.com/login',
}

const url = urls[target]
if (!url) {
  console.error(`알 수 없는 대상: ${target}. ezadmin / ezchain / coupang 중 하나`)
  process.exit(1)
}

console.log(`\n[셀렉터 녹화] ${target} 열기: ${url}`)
console.log(`브라우저가 열리면 요소를 클릭하여 셀렉터를 확인하세요.`)
console.log(`개발자 도구(F12) > Elements > 우클릭 > Copy > Copy selector\n`)

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext()
const page = await context.newPage()

// 요소 hover 시 셀렉터 표시
await page.addInitScript(() => {
  document.addEventListener('mouseover', (e) => {
    const el = e.target as Element
    if (!el) return
    const tag = el.tagName.toLowerCase()
    const id = el.id ? `#${el.id}` : ''
    const cls = Array.from(el.classList).slice(0, 2).map(c => `.${c}`).join('')
    const name = el.getAttribute('name') ? `[name="${el.getAttribute('name')}"]` : ''
    console.log(`hover: ${tag}${id}${cls}${name}`)
  })
})

await page.goto(url, { waitUntil: 'domcontentloaded' })
console.log('브라우저가 열렸습니다. 창을 닫으면 종료됩니다.\n')

// 창이 닫힐 때까지 대기
page.on('close', () => browser.close())
browser.on('disconnected', () => process.exit(0))
