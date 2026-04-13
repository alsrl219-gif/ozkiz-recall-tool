import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { RecallPriority, RecallStatus } from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(n: number, unit = ''): string {
  return n.toLocaleString('ko-KR') + (unit ? ` ${unit}` : '')
}

export function formatDate(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export function formatDateTime(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── 우선순위 ────────────────────────────────────────────────────
export const PRIORITY_LABEL: Record<RecallPriority, string> = {
  urgent: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
}

export const PRIORITY_COLOR: Record<
  RecallPriority,
  { bg: string; text: string; border: string; dot: string }
> = {
  urgent: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    dot: 'bg-red-500',
  },
  high: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    dot: 'bg-orange-500',
  },
  medium: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    dot: 'bg-yellow-500',
  },
  low: {
    bg: 'bg-gray-50',
    text: 'text-gray-600',
    border: 'border-gray-200',
    dot: 'bg-gray-400',
  },
}

// ─── 상태 ────────────────────────────────────────────────────────
export const STATUS_LABEL: Record<RecallStatus, string> = {
  recommended: '회수 권장',
  requested: '회수 요청됨',
  'in-transit': '이송 중',
  received: '입고 완료',
  cancelled: '취소',
}

export const STATUS_COLOR: Record<RecallStatus, { bg: string; text: string }> = {
  recommended: { bg: 'bg-brand-50', text: 'text-brand-700' },
  requested: { bg: 'bg-blue-50', text: 'text-blue-700' },
  'in-transit': { bg: 'bg-purple-50', text: 'text-purple-700' },
  received: { bg: 'bg-green-50', text: 'text-green-700' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-500' },
}

// ─── 점수 색상 ───────────────────────────────────────────────────
export function scoreColor(score: number): string {
  if (score >= 80) return 'text-red-600'
  if (score >= 60) return 'text-orange-600'
  if (score >= 40) return 'text-yellow-600'
  return 'text-gray-500'
}

export function scoreBg(score: number): string {
  if (score >= 80) return 'bg-red-500'
  if (score >= 60) return 'bg-orange-500'
  if (score >= 40) return 'bg-yellow-400'
  return 'bg-gray-300'
}

// ─── CSV 내보내기 ────────────────────────────────────────────────
export function downloadCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return
  const headers = Object.keys(data[0])
  const rows = data.map((row) =>
    headers.map((h) => {
      const val = row[h]
      if (val === null || val === undefined) return ''
      const s = String(val)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }).join(',')
  )
  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── ID 생성 ─────────────────────────────────────────────────────
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
