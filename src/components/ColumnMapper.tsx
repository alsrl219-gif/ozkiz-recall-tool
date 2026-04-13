import type { ColumnMapping } from '../types'

interface FieldDef {
  key: keyof ColumnMapping
  label: string
  required: boolean
}

const FIELD_DEFS: FieldDef[] = [
  { key: 'productId', label: '상품코드', required: true },
  { key: 'barcode', label: '바코드', required: false },
  { key: 'productName', label: '상품명', required: false },
  { key: 'storeId', label: '매장코드', required: false },
  { key: 'storeName', label: '매장명', required: false },
  { key: 'qty', label: '수량 (온라인/재고)', required: true },
  { key: 'offlineQty', label: '매장판매수량', required: false },
  { key: 'date', label: '날짜', required: false },
  { key: 'revenue', label: '금액', required: false },
  { key: 'category', label: '카테고리', required: false },
  { key: 'season', label: '시즌', required: false },
  { key: 'imageUrl', label: '이미지URL', required: false },
]

interface Props {
  headers: string[]
  mapping: Partial<ColumnMapping>
  onChange: (mapping: Partial<ColumnMapping>) => void
  showFields?: (keyof ColumnMapping)[]
}

export default function ColumnMapper({ headers, mapping, onChange, showFields }: Props) {
  const fields = showFields
    ? FIELD_DEFS.filter((f) => showFields.includes(f.key))
    : FIELD_DEFS

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-gray-700 mb-2">컬럼 매핑 확인</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map(({ key, label, required }) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              {label}
              {required && <span className="text-red-500 ml-0.5">*</span>}
            </label>
            <select
              value={mapping[key] ?? ''}
              onChange={(e) => onChange({ ...mapping, [key]: e.target.value || undefined })}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="">{required ? '— 선택 필요 —' : '— 미사용 —'}</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  )
}
