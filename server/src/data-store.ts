import fs from 'fs'
import path from 'path'
import { config } from './config.js'
import type { ProcessedData } from './processor.js'

export async function saveData(data: ProcessedData): Promise<void> {
  const dir = path.dirname(config.dataOutput)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(config.dataOutput, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`[데이터 저장] ${config.dataOutput}`)
}

export function loadData(): ProcessedData | null {
  try {
    if (!fs.existsSync(config.dataOutput)) return null
    const raw = fs.readFileSync(config.dataOutput, 'utf-8')
    return JSON.parse(raw) as ProcessedData
  } catch {
    return null
  }
}

export function getDataAge(): { ageMinutes: number; processedAt: string } | null {
  const data = loadData()
  if (!data?.processedAt) return null
  const ageMs = Date.now() - new Date(data.processedAt).getTime()
  return {
    ageMinutes: Math.floor(ageMs / 60_000),
    processedAt: data.processedAt,
  }
}
