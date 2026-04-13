import { useState } from 'react'
import { X, Package, ArrowRight, CheckCircle } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { PriorityBadge, ScoreBar } from './RecallPriorityBadge'
import { cn, formatNumber } from '../utils/helpers'
import type { RecallItem } from '../types'

interface Props {
  item: RecallItem
  onClose: () => void
}

export default function StoreRecallModal({ item, onClose }: Props) {
  const { getProduct, getStore, requestRecall } = useAppStore()
  const product = getProduct(item.productId)
  const store = getStore(item.storeId)
  const [qty, setQty] = useState(item.suggestedQty)
  const [note, setNote] = useState(item.note ?? '')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit() {
    if (qty <= 0) return
    requestRecall(item.id, qty, note)
    setSubmitted(true)
    setTimeout(onClose, 1500)
  }

  if (submitted) {
    return (
      <ModalWrapper onClose={onClose}>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">회수 요청 완료</div>
            <div className="text-sm text-gray-500 mt-1">센터에 회수 요청이 전달되었습니다</div>
          </div>
        </div>
      </ModalWrapper>
    )
  }

  return (
    <ModalWrapper onClose={onClose}>
      <div className="p-6">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">회수 요청</div>
            <h2 className="text-xl font-bold text-gray-900">
              {product?.name ?? item.productId}
            </h2>
            <div className="text-sm text-gray-500 mt-0.5">{store?.name ?? item.storeId}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 회수 점수 */}
        <div className="bg-gray-50 rounded-xl p-4 mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 font-medium">회수 우선순위 점수</span>
            <PriorityBadge priority={item.priority} />
          </div>
          <ScoreBar score={item.recallScore} />
          {item.reason && (
            <p className="text-xs text-gray-500 mt-2 leading-relaxed">{item.reason}</p>
          )}
        </div>

        {/* 재고 현황 */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-white border border-gray-100 rounded-xl p-4 text-center">
            <Package className="w-4 h-4 text-gray-400 mx-auto mb-1" />
            <div className="text-xl font-bold text-gray-900">{formatNumber(item.suggestedQty)}</div>
            <div className="text-xs text-gray-500">권장 회수 수량</div>
          </div>
          <div className="bg-brand-50 border border-brand-100 rounded-xl p-4 text-center">
            <ArrowRight className="w-4 h-4 text-brand-500 mx-auto mb-1" />
            <div className="text-xl font-bold text-brand-700">{formatNumber(qty)}</div>
            <div className="text-xs text-brand-600">요청 수량</div>
          </div>
        </div>

        {/* 수량 입력 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            실제 회수 가능 수량
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-lg flex items-center justify-center transition-colors"
            >
              −
            </button>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Math.max(0, parseInt(e.target.value) || 0))}
              className="flex-1 h-10 text-center text-lg font-bold border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-300"
              min={0}
            />
            <button
              onClick={() => setQty((q) => q + 1)}
              className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-lg flex items-center justify-center transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* 메모 */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            메모 <span className="text-gray-400 font-normal">(선택)</span>
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
            placeholder="특이사항이나 메모를 입력하세요"
          />
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={qty <= 0}
            className={cn(
              'flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-colors',
              qty > 0
                ? 'bg-brand-500 hover:bg-brand-600'
                : 'bg-gray-200 cursor-not-allowed text-gray-400'
            )}
          >
            회수 요청
          </button>
        </div>
      </div>
    </ModalWrapper>
  )
}

function ModalWrapper({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
