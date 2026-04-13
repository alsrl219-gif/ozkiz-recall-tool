/**
 * OZKIZ RT 서버
 *
 * - Express API: React 앱에 데이터 제공
 * - node-cron: 스케줄에 따라 자동 스크래핑
 *
 * 실행: tsx src/index.ts
 */

import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import { config } from './config.js'
import { loadData, getDataAge } from './data-store.js'
import { runAllScrapers } from './scrapers/index.js'
import { registerConfigRoutes, readConfig } from './api-config.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const router = express.Router()

// ─── API 엔드포인트 ───────────────────────────────────────────────

// 최신 처리 데이터 반환
router.get('/data', (_req, res) => {
  const data = loadData()
  if (!data) {
    return res.status(404).json({ error: '데이터 없음. 스크래핑을 먼저 실행하세요.' })
  }
  res.json(data)
})

// 데이터 최신 여부 확인
router.get('/status', (_req, res) => {
  const age = getDataAge()
  const cfg = readConfig()
  res.json({
    hasData: !!age,
    ...age,
    nextSchedule: config.cronSchedule,
    isRunning: scrapeRunning,
    configured: !!(cfg.ezadmin?.id || cfg.coupang?.id),
  })
})

// 수동 즉시 실행
router.post('/scrape', async (_req, res) => {
  if (scrapeRunning) {
    return res.status(409).json({ error: '이미 실행 중입니다' })
  }
  res.json({ message: '스크래핑 시작됨. /api/status 로 진행 상황 확인' })
  runScrape()
})

// 설정 + 테스트 라우트 등록
registerConfigRoutes(router)

app.use('/api', router)

// ─── 스케줄러 ────────────────────────────────────────────────────
let scrapeRunning = false

async function runScrape() {
  if (scrapeRunning) return
  scrapeRunning = true
  try {
    await runAllScrapers()
  } finally {
    scrapeRunning = false
  }
}

console.log(`[스케줄] 등록: ${config.cronSchedule}`)
cron.schedule(config.cronSchedule, () => {
  console.log('[스케줄] 자동 스크래핑 시작')
  runScrape()
}, { timezone: 'Asia/Seoul' })

// ─── 서버 시작 ───────────────────────────────────────────────────
app.listen(config.port, () => {
  const age = getDataAge()
  console.log(`\n🚀 OZKIZ RT 서버 실행 중: http://localhost:${config.port}`)
  console.log(`   스케줄: ${config.cronSchedule} (Asia/Seoul)`)
  if (age) {
    console.log(`   마지막 데이터: ${age.processedAt} (${age.ageMinutes}분 전)`)
  } else {
    console.log(`   데이터 없음. POST /api/scrape 로 즉시 실행 가능`)
  }
  console.log()
})
