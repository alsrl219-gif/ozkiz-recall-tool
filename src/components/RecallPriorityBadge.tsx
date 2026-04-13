import { cn, PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL } from '../utils/helpers'
import type { RecallPriority, RecallStatus } from '../types'

export function PriorityBadge({ priority }: { priority: RecallPriority }) {
  const c = PRIORITY_COLOR[priority]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
        c.bg, c.text, c.border
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', c.dot)} />
      {PRIORITY_LABEL[priority]}
    </span>
  )
}

export function StatusBadge({ status }: { status: RecallStatus }) {
  const c = STATUS_COLOR[status]
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium', c.bg, c.text)}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-red-500' : score >= 60 ? 'bg-orange-500' : score >= 40 ? 'bg-yellow-400' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums text-gray-700 w-7 text-right">{score}</span>
    </div>
  )
}
