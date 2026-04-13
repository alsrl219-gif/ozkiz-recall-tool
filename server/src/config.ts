import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function required(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`환경변수 누락: ${key} (.env 파일 확인)`)
  return val
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const config = {
  ezadmin: {
    url: required('EZADMIN_URL'),
    id: required('EZADMIN_ID'),
    pw: required('EZADMIN_PW'),
  },
  ezchain: {
    url: required('EZCHAIN_URL'),
    id: required('EZCHAIN_ID'),
    pw: required('EZCHAIN_PW'),
  },
  coupang: {
    id: required('COUPANG_ID'),
    pw: required('COUPANG_PW'),
    vendorId: optional('COUPANG_VENDOR_ID', ''),
  },
  analysisPeriodDays: parseInt(optional('ANALYSIS_PERIOD_DAYS', '30'), 10),
  cronSchedule: optional('CRON_SCHEDULE', '0 6 * * *'),
  port: parseInt(optional('PORT', '3001'), 10),
  downloadDir: path.resolve(__dirname, '../../', optional('DOWNLOAD_DIR', './downloads')),
  dataOutput: path.resolve(__dirname, '../../', optional('DATA_OUTPUT', './data/latest.json')),
  headless: optional('HEADLESS', 'true') !== 'false',
}
