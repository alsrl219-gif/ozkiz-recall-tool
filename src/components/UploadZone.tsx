import { useCallback, useState } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '../utils/helpers'

interface Props {
  onFile: (file: File) => Promise<void>
  accept?: string
  label: string
  description?: string
  loading?: boolean
  success?: boolean
  error?: string
}

export default function UploadZone({
  onFile,
  accept = '.csv',
  label,
  description,
  loading,
  success,
  error,
}: Props) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) await onFile(file)
    },
    [onFile]
  )

  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        await onFile(file)
        e.target.value = ''
      }
    },
    [onFile]
  )

  return (
    <label
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all',
        dragging ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300 hover:bg-gray-50',
        success && 'border-green-300 bg-green-50',
        error && 'border-red-300 bg-red-50'
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input type="file" accept={accept} className="hidden" onChange={handleChange} />

      {loading ? (
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      ) : success ? (
        <CheckCircle className="w-8 h-8 text-green-500" />
      ) : error ? (
        <AlertCircle className="w-8 h-8 text-red-400" />
      ) : dragging ? (
        <Upload className="w-8 h-8 text-brand-500" />
      ) : (
        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
          <FileText className="w-6 h-6 text-gray-400" />
        </div>
      )}

      <div className="text-center">
        <div className={cn(
          'text-sm font-semibold',
          success ? 'text-green-700' : error ? 'text-red-600' : 'text-gray-700'
        )}>
          {loading ? '파일 처리 중...' : success ? '업로드 완료' : error ? '오류 발생' : label}
        </div>
        {!loading && (
          <div className="text-xs text-gray-400 mt-1">
            {error ?? description ?? 'CSV 파일을 드래그하거나 클릭하여 업로드'}
          </div>
        )}
      </div>
    </label>
  )
}
