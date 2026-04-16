import { useState } from 'react'
import { Database, RefreshCw, Link, CheckCircle, AlertCircle, Trash2, ChevronDown, Calendar } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import UploadZone from '../components/UploadZone'
import ColumnMapper from '../components/ColumnMapper'
import {
  parseCSV,
  parseAdminStock,
  parseAdminSalesPeriod,
  parseStoreStock,
  parseStoreStockWide,
  extractProductInfoFromStoreWide,
  parseChainSalesWide,
  detectStoreFormat,
  getStoreColumns,
  parseStoreSalesPeriod,
  parseCoupangSales,
  inferColumnMapping,
  detectSeasonColumnFromData,
  fetchGoogleSheetCSV,
  parseCSVText,
} from '../utils/csvParser'
import { formatDateTime, formatNumber } from '../utils/helpers'
import type { ColumnMapping, DataSourceType } from '../types'

interface UploadState {
  loading: boolean
  success: boolean
  error: string
  headers: string[]
  preview: Record<string, string>[]
  allRows: Record<string, string>[]
  mapping: Partial<ColumnMapping>
  showMapper: boolean
  pendingFile?: File
}

const INIT: UploadState = {
  loading: false, success: false, error: '', headers: [],
  preview: [], allRows: [], mapping: {}, showMapper: false,
}

// 오늘 기준 30일 전 날짜 (기본값)
function defaultPeriodStart() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function Upload() {
  const store = useAppStore()

  const [adminStock, setAdminStock] = useState<UploadState>(INIT)
  const [adminSales, setAdminSales] = useState<UploadState>(INIT)
  const [adminSalesPeriod, setAdminSalesPeriod] = useState({
    start: defaultPeriodStart(), end: todayStr(),
  })

  const [chainStore, setChainStore] = useState<UploadState>(INIT)
  const [chainStoreFormat, setChainStoreFormat] = useState<'wide' | 'long' | null>(null)
  const [chainSalesPeriod, setChainSalesPeriod] = useState({
    start: defaultPeriodStart(), end: todayStr(),
  })

  const [chainSales, setChainSales] = useState<UploadState>(INIT)
  const [chainSalesPeriod2, setChainSalesPeriod2] = useState({
    start: (() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10) })(),
    end: todayStr(),
  })

  const [coupang, setCoupang] = useState<UploadState>(INIT)
  const [coupangPeriod, setCoupangPeriod] = useState({
    start: defaultPeriodStart(), end: todayStr(),
  })

  const [sheetsUrl, setSheetsUrl] = useState(store.settings.googleSheetsUrl ?? '')
  const [sheetsLoading, setSheetsLoading] = useState(false)
  const [sheetsStatus, setSheetsStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const [sheetsError, setSheetsError] = useState('')

  // ── 공통 파일 처리 ──────────────────────────────────────────
  async function handleFile(
    file: File,
    sourceType: DataSourceType,
    setState: React.Dispatch<React.SetStateAction<UploadState>>
  ) {
    setState((s) => ({ ...s, loading: true, error: '', success: false }))
    try {
      const { headers, rows } = await parseCSV(file)
      const mapping = inferColumnMapping(headers, sourceType)

      // 시즌 컬럼: 이름 매칭 실패 시 값 패턴으로 재탐색
      // (이지어드민의 '상품추가항목3' 같이 이름이 달라도 "2025SS", "2026FW" 값으로 감지)
      if (!mapping.season) {
        const detected = detectSeasonColumnFromData(headers, rows)
        if (detected) mapping.season = detected
      }

      // 이지체인: 피벗(wide) vs 일반(long) 자동 감지
      if (sourceType === 'chain_store') {
        setChainStoreFormat(detectStoreFormat(headers))
      }
      setState({
        loading: false, success: false, error: '',
        headers, preview: rows.slice(0, 5), allRows: rows,
        mapping, showMapper: true, pendingFile: file,
      })
    } catch {
      setState((s) => ({ ...s, loading: false, error: 'CSV 파싱 실패.' }))
    }
  }

  // ── 이지어드민 현재고 확정 ───────────────────────────────────
  function commitAdminStock() {
    const { allRows, mapping, headers } = adminStock
    if (!mapping.productId || !mapping.qty) return
    try {
      // mapping을 복사해서 fallback 감지를 반영 (원본 state 변경 X)
      const m: ColumnMapping = { ...mapping } as ColumnMapping

      // season 컬럼 fallback: 이름 매핑 없으면 값 패턴으로 재탐색
      if (!m.season) {
        const detected = detectSeasonColumnFromData(headers, allRows)
        if (detected) m.season = detected
      }

      if (allRows.length === 0) throw new Error('파싱된 데이터가 없습니다. 파일 형식을 확인해주세요.')
      const { centerStocks, products, barcodeMap } = parseAdminStock(allRows, m)

      // mapping.color가 안 잡혔을 경우 fallback: extractProductInfoFromStoreWide로 보완
      if (!m.color) {
        const extra = extractProductInfoFromStoreWide(allRows, headers)
        extra.forEach((pi) => {
          const p = products.find((x) => x.id === pi.id)
          if (p && pi.color) p.color = pi.color
        })
      }

      // season도 미설정이면 extractProductInfoFromStoreWide로 보완
      if (!m.season) {
        const extra = extractProductInfoFromStoreWide(allRows, headers)
        extra.forEach((pi) => {
          const p = products.find((x) => x.id === pi.id)
          if (p && pi.season && !p.season) p.season = pi.season
        })
      }

      store.setCenterStocks(centerStocks)
      store.addProducts(products)
      store.setBarcodeMap(barcodeMap)
      store.addUploadSession({
        id: Date.now().toString(), sourceType: 'admin_stock',
        fileName: adminStock.pendingFile?.name ?? 'unknown',
        uploadedAt: new Date().toISOString(), rowCount: centerStocks.length, mapping: m,
      })
      setAdminStock((s) => ({ ...s, success: true, showMapper: false, error: '' }))
    } catch (e) {
      setAdminStock((s) => ({ ...s, error: String(e) }))
    }
  }

  // ── 이지어드민 판매 통계 확정 ────────────────────────────────
  function commitAdminSales() {
    const { allRows, mapping } = adminSales
    if (!mapping.productId || !mapping.qty) return
    try {
      const m = mapping as ColumnMapping
      if (allRows.length === 0) throw new Error('파싱된 데이터가 없습니다.')
      const aggregates = parseAdminSalesPeriod(
        allRows, m,
        adminSalesPeriod.start, adminSalesPeriod.end,
        store.barcodeMap
      )
      store.setPeriodSales(aggregates, 'online')
      if (m.offlineQty) {
        const offAgg = aggregates.filter((a) => a.channel === 'offline')
        if (offAgg.length) store.setPeriodSales(offAgg, 'offline')
      }
      store.addUploadSession({
        id: Date.now().toString(), sourceType: 'admin_sales',
        fileName: adminSales.pendingFile?.name ?? 'unknown',
        uploadedAt: new Date().toISOString(), rowCount: aggregates.length, mapping: m,
      })
      setAdminSales((s) => ({ ...s, success: true, showMapper: false, error: '' }))
    } catch (e) {
      setAdminSales((s) => ({ ...s, error: String(e) }))
    }
  }

  // ── 이지체인 매장 확정 ───────────────────────────────────────
  function commitChainStore() {
    const { allRows, mapping, headers } = chainStore
    try {
      let stocks
      if (chainStoreFormat === 'wide') {
        stocks = parseStoreStockWide(allRows, headers)
        // 이지체인 Wide 파일에서 상품 옵션(색상/사이즈) 정보 추출 → 기존 상품 업데이트
        const productInfo = extractProductInfoFromStoreWide(allRows, headers)
        if (productInfo.length > 0) {
          // 기존 상품과 merge: 이름·카테고리·시즌·옵션(color) 업데이트
          const existing = store.products
          const merged = productInfo.map((pi) => {
            const ex = existing.find((p) => p.id === pi.id)
            return {
              id: pi.id,
              name: pi.name || ex?.name || pi.id,
              category: pi.category || ex?.category || '',
              season: pi.season || ex?.season || '',
              color: pi.color ?? ex?.color,
              size: ex?.size,
              imageUrl: ex?.imageUrl,
            }
          })
          store.addProducts(merged)
        }
      } else {
        if (!mapping.productId || !mapping.qty || !mapping.storeId) return
        stocks = parseStoreStock(allRows, mapping as ColumnMapping)
      }

      store.setStoreStocks(stocks)

      const storeIds = [...new Set(stocks.map((s) => s.storeId))]
      const existing = new Set(store.settings.stores.map((s) => s.id))
      const newStores = storeIds
        .filter((id) => !existing.has(id))
        .map((id) => ({
          id,
          name: id.replace(/^[A-Z]+\d+_/, ''),
          region: '',
        }))
      if (newStores.length) {
        store.updateSettings({ stores: [...store.settings.stores, ...newStores] })
      }

      const m = mapping as ColumnMapping
      if (chainStoreFormat !== 'wide' && m.offlineQty) {
        const salesAgg = parseStoreSalesPeriod(
          allRows, { ...m, qty: m.offlineQty } as ColumnMapping,
          chainSalesPeriod.start, chainSalesPeriod.end
        )
        if (salesAgg.length) store.setPeriodSales(salesAgg, 'offline')
      }

      store.addUploadSession({
        id: Date.now().toString(), sourceType: 'chain_store',
        fileName: chainStore.pendingFile?.name ?? 'unknown',
        uploadedAt: new Date().toISOString(), rowCount: stocks.length, mapping: m,
      })
      setChainStore((s) => ({ ...s, success: true, showMapper: false, error: '' }))
    } catch (e) {
      setChainStore((s) => ({ ...s, error: String(e) }))
    }
  }

  // ── 이지체인 매장별 판매현황 확정 ────────────────────────────
  function commitChainSales() {
    const { allRows, mapping, headers } = chainSales
    try {
      let aggregates
      // Wide 형태(E200): 매장이 컬럼으로 펼쳐진 구조
      if (detectStoreFormat(headers) === 'wide') {
        aggregates = parseChainSalesWide(allRows, headers, chainSalesPeriod2.start, chainSalesPeriod2.end)
      } else {
        if (!mapping.productId || !mapping.qty) return
        aggregates = parseStoreSalesPeriod(allRows, mapping as ColumnMapping, chainSalesPeriod2.start, chainSalesPeriod2.end)
      }
      if (aggregates.length) store.setPeriodSales(aggregates, 'offline')
      store.addUploadSession({
        id: Date.now().toString(), sourceType: 'chain_store',
        fileName: chainSales.pendingFile?.name ?? 'unknown',
        uploadedAt: new Date().toISOString(), rowCount: aggregates.length, mapping: mapping as ColumnMapping,
      })
      setChainSales((s) => ({ ...s, success: true, showMapper: false, error: '' }))
    } catch (e) {
      setChainSales((s) => ({ ...s, error: String(e) }))
    }
  }

  // ── 쿠팡 판매 확정 ──────────────────────────────────────────
  function commitCoupang() {
    const { allRows, mapping } = coupang
    if (!mapping.qty) return
    try {
      const m = mapping as ColumnMapping
      const aggregates = parseCoupangSales(
        allRows, m,
        coupangPeriod.start, coupangPeriod.end,
        store.barcodeMap
      )
      store.setPeriodSales(aggregates, 'coupang')
      store.addUploadSession({
        id: Date.now().toString(), sourceType: 'coupang',
        fileName: coupang.pendingFile?.name ?? 'unknown',
        uploadedAt: new Date().toISOString(), rowCount: aggregates.length, mapping: m,
      })
      setCoupang((s) => ({ ...s, success: true, showMapper: false, error: '' }))
    } catch (e) {
      setCoupang((s) => ({ ...s, error: String(e) }))
    }
  }

  // ── 구글 시트 ────────────────────────────────────────────────
  async function fetchSheets() {
    if (!sheetsUrl) return
    setSheetsLoading(true)
    setSheetsStatus('idle')
    try {
      const text = await fetchGoogleSheetCSV(sheetsUrl)
      const { rows } = parseCSVText(text)
      // 단순 온라인 판매 적재 (컬럼 자동 매핑)
      const firstRow = rows[0] ?? {}
      const headers = Object.keys(firstRow)
      const mapping = inferColumnMapping(headers, 'admin_sales')
      if (mapping.productId && mapping.qty) {
        const agg = parseAdminSalesPeriod(
          rows, mapping as ColumnMapping,
          adminSalesPeriod.start, adminSalesPeriod.end,
          store.barcodeMap
        )
        if (agg.length) store.setPeriodSales(agg, 'online')
      }
      store.updateSettings({ googleSheetsUrl: sheetsUrl })
      setSheetsStatus('ok')
    } catch {
      setSheetsStatus('err')
      setSheetsError('URL 가져오기 실패. 시트가 "웹에 게시"되어 있는지 확인해주세요.')
    } finally {
      setSheetsLoading(false)
    }
  }

  const sessions = store.uploadSessions.slice(0, 10)
  const barcodeCount = Object.keys(store.barcodeMap).length

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">데이터 업로드</h2>
        <p className="text-sm text-gray-500 mt-1">
          이지어드민·이지체인·쿠팡에서 내려받은 CSV를 업로드하세요.
          <strong className="text-gray-700"> 순서: ① 현재고 → ② 판매통계 → ③ 이지체인 → ④ 쿠팡</strong>
        </p>
        {barcodeCount > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-full">
            <CheckCircle className="w-3.5 h-3.5" />
            바코드↔상품코드 매핑 {formatNumber(barcodeCount)}건 로드됨
          </div>
        )}
      </div>

      {/* ① 이지어드민 현재고조회 */}
      <UploadCard
        step="①"
        title="이지어드민 · 현재고조회"
        description="상품별 센터 가용재고 + 이미지URL"
        badge="admin"
        badgeLabel="이지어드민"
        hint={
          <ul className="text-xs text-gray-500 space-y-0.5 list-disc list-inside mt-1">
            <li>체크 항목: 상품코드, 바코드, 시즌(상품추가항목3), 복종(상품추가항목2), 상품명, 옵션, <strong>가용재고</strong>, 매장총재고, <strong>이미지URL</strong></li>
          </ul>
        }
        state={adminStock}
        setState={setAdminStock}
        sourceType="admin_stock"
        onFile={(f) => handleFile(f, 'admin_stock', setAdminStock)}
        onCommit={commitAdminStock}
        showFields={['productId', 'barcode', 'productName', 'color', 'qty', 'category', 'season', 'imageUrl']}
        canCommit={!!adminStock.mapping.productId && !!adminStock.mapping.qty}
      />

      {/* ② 이지어드민 어드민상품매출통계 */}
      <UploadCard
        step="②"
        title="이지어드민 · 어드민상품매출통계"
        description="기간별 온라인 + 매장 판매 합계"
        badge="admin"
        badgeLabel="이지어드민"
        hint={
          <ul className="text-xs text-gray-500 space-y-0.5 list-disc list-inside mt-1">
            <li>체크 항목: 상품코드, 바코드, 시즌(상품추가항목3), 상품명, 옵션, <strong>수량(온라인판매수량)</strong>, <strong>매장판매(매장판매수량)</strong></li>
            <li className="text-orange-600">이지어드민에서 다운 시 선택한 날짜 범위를 아래에 입력해야 합니다</li>
          </ul>
        }
        state={adminSales}
        setState={setAdminSales}
        sourceType="admin_sales"
        onFile={(f) => handleFile(f, 'admin_sales', setAdminSales)}
        onCommit={commitAdminSales}
        showFields={['productId', 'barcode', 'productName', 'qty', 'offlineQty']}
        canCommit={!!adminSales.mapping.productId && !!adminSales.mapping.qty}
        periodSelector={
          <PeriodSelector
            start={adminSalesPeriod.start}
            end={adminSalesPeriod.end}
            onChange={(s, e) => setAdminSalesPeriod({ start: s, end: e })}
          />
        }
      />

      {/* ③ 이지체인 매장 */}
      <UploadCard
        step="③"
        title="이지체인 · 매장별 재고"
        description="전국 매장별 현재 재고 수량"
        badge="chain"
        badgeLabel="이지체인"
        hint={
          <ul className="text-xs text-gray-500 space-y-0.5 list-disc list-inside mt-1">
            <li>상품 키는 <strong>상품코드(S로 시작)</strong>로 이지어드민 상품코드와 동일해야 합니다</li>
            {chainStoreFormat === 'wide'
              ? <li className="text-green-600">✓ 피벗 형태 감지됨 — 매장 컬럼 자동 인식</li>
              : <li>매장코드/매장명 컬럼을 매핑해주세요</li>
            }
          </ul>
        }
        state={chainStore}
        setState={setChainStore}
        sourceType="chain_store"
        onFile={(f) => handleFile(f, 'chain_store', setChainStore)}
        onCommit={commitChainStore}
        showFields={chainStoreFormat === 'wide' ? [] : ['productId', 'storeId', 'storeName', 'qty', 'offlineQty']}
        canCommit={
          chainStoreFormat === 'wide'
            ? chainStore.headers.length > 0
            : !!chainStore.mapping.productId && !!chainStore.mapping.qty && !!chainStore.mapping.storeId
        }
        wideStoreInfo={
          chainStoreFormat === 'wide'
            ? getStoreColumns(chainStore.headers)
            : null
        }
        periodSelector={
          chainStoreFormat !== 'wide' && chainStore.mapping.offlineQty
            ? <PeriodSelector
                start={chainSalesPeriod.start}
                end={chainSalesPeriod.end}
                onChange={(s, e) => setChainSalesPeriod({ start: s, end: e })}
              />
            : null
        }
      />

      {/* ④ 이지체인 매장별 판매현황 */}
      <UploadCard
        step="④"
        title="이지체인 · 매장별 판매현황"
        description="매장별 기간 판매수량 (오프라인 수요 분석)"
        badge="chain"
        badgeLabel="이지체인"
        hint={
          <ul className="text-xs text-gray-500 space-y-0.5 list-disc list-inside mt-1">
            <li>이지체인 → 정산/통계 → <strong>E200-상품별판매현황</strong> → 전체 다운로드</li>
            <li>기간: 최근 90일 권장 · 매장별 판매수량 컬럼이 자동 인식됩니다</li>
          </ul>
        }
        state={chainSales}
        setState={setChainSales}
        sourceType="admin_sales"
        onFile={(f) => handleFile(f, 'admin_sales', setChainSales)}
        onCommit={commitChainSales}
        showFields={[]}
        canCommit={chainSales.headers.length > 0}
        wideStoreInfo={
          chainSales.headers.length > 0 && detectStoreFormat(chainSales.headers) === 'wide'
            ? getStoreColumns(chainSales.headers)
            : null
        }
        periodSelector={
          <PeriodSelector
            start={chainSalesPeriod2.start}
            end={chainSalesPeriod2.end}
            onChange={(s, e) => setChainSalesPeriod2({ start: s, end: e })}
          />
        }
      />

      {/* ⑤ 쿠팡 */}
      <UploadCard
        step="⑤"
        title="쿠팡 · 판매 데이터"
        description="쿠팡 채널 기간별 판매 수량"
        badge="coupang"
        badgeLabel="쿠팡"
        hint={
          <ul className="text-xs text-gray-500 space-y-0.5 list-disc list-inside mt-1">
            <li>쿠팡 상품 키는 <strong>바코드</strong>(이지어드민 바코드와 동일)입니다</li>
            <li className="text-orange-600">① 현재고 업로드 먼저 해야 바코드↔상품코드 매핑이 작동합니다</li>
          </ul>
        }
        state={coupang}
        setState={setCoupang}
        sourceType="coupang"
        onFile={(f) => handleFile(f, 'coupang', setCoupang)}
        onCommit={commitCoupang}
        showFields={['barcode', 'productId', 'qty']}
        canCommit={!!coupang.mapping.qty}
        periodSelector={
          <PeriodSelector
            start={coupangPeriod.start}
            end={coupangPeriod.end}
            onChange={(s, e) => setCoupangPeriod({ start: s, end: e })}
          />
        }
      />

      {/* 구글 시트 자동 연동 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <Link className="w-4 h-4 text-brand-500" />
          <h3 className="text-sm font-semibold text-gray-900">구글 시트 자동 연동 (무료)</h3>
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">선택</span>
        </div>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          구글 시트 → 파일 → 공유 → <strong>"웹에 게시" → CSV 형식</strong> URL 복사.
          버튼 한 번으로 최신 판매 데이터를 가져옵니다.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={sheetsUrl}
            onChange={(e) => setSheetsUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/.../pub?output=csv"
            className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
          <button
            onClick={fetchSheets}
            disabled={sheetsLoading || !sheetsUrl}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${sheetsLoading ? 'animate-spin' : ''}`} />
            가져오기
          </button>
        </div>
        {sheetsStatus === 'ok' && (
          <div className="flex items-center gap-2 mt-2 text-xs text-green-600">
            <CheckCircle className="w-3.5 h-3.5" /> 성공적으로 가져왔습니다
          </div>
        )}
        {sheetsStatus === 'err' && (
          <div className="flex items-center gap-2 mt-2 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5" /> {sheetsError}
          </div>
        )}
      </div>

      {/* 업로드 이력 */}
      {sessions.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-gray-400" />
              업로드 이력
            </h3>
          </div>
          <div className="space-y-2">
            {sessions.map((s) => {
              const colors: Record<string, string> = {
                admin_stock: 'bg-brand-50 text-brand-700',
                admin_sales: 'bg-blue-50 text-blue-700',
                chain_store: 'bg-green-50 text-green-700',
                coupang: 'bg-orange-50 text-orange-700',
              }
              const labels: Record<string, string> = {
                admin_stock: '현재고', admin_sales: '판매통계',
                chain_store: '이지체인', coupang: '쿠팡',
              }
              return (
                <div key={s.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors[s.sourceType] ?? 'bg-gray-100 text-gray-600'}`}>
                    {labels[s.sourceType] ?? s.sourceType}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-700 truncate">{s.fileName}</div>
                    <div className="text-xs text-gray-400">{formatNumber(s.rowCount)}행 · {formatDateTime(s.uploadedAt)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── 기간 선택기 컴포넌트 ────────────────────────────────────────
function PeriodSelector({
  start, end, onChange,
}: {
  start: string; end: string; onChange: (s: string, e: string) => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <span className="text-xs font-medium text-gray-600">다운로드 기간:</span>
      <input
        type="date" value={start}
        onChange={(e) => onChange(e.target.value, end)}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
      />
      <span className="text-xs text-gray-400">~</span>
      <input
        type="date" value={end}
        onChange={(e) => onChange(start, e.target.value)}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-300"
      />
    </div>
  )
}

// ── 업로드 카드 컴포넌트 ────────────────────────────────────────
interface UploadCardProps {
  step: string
  title: string
  description: string
  badge: string
  badgeLabel: string
  hint?: React.ReactNode
  state: UploadState
  setState: React.Dispatch<React.SetStateAction<UploadState>>
  sourceType: DataSourceType
  onFile: (f: File) => Promise<void>
  onCommit: () => void
  showFields?: (keyof ColumnMapping)[]
  canCommit: boolean
  periodSelector?: React.ReactNode
  wideStoreInfo?: string[] | null
}

function UploadCard({
  step, title, description, badge, badgeLabel, hint,
  state, setState, onFile, onCommit, showFields, canCommit, periodSelector, wideStoreInfo,
}: UploadCardProps) {
  const badgeColor: Record<string, string> = {
    admin: 'bg-brand-50 text-brand-700',
    chain: 'bg-green-50 text-green-700',
    coupang: 'bg-orange-50 text-orange-700',
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-bold text-gray-400 w-5">{step}</span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor[badge] ?? 'bg-gray-100 text-gray-600'}`}>
          {badgeLabel}
        </span>
        {state.success && (
          <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />
        )}
      </div>
      <p className="text-xs text-gray-400 mb-1 ml-5">{description}</p>
      {hint && <div className="ml-5 mb-3">{hint}</div>}

      <UploadZone
        onFile={onFile}
        loading={state.loading}
        success={state.success}
        error={state.error}
        label="CSV 파일 업로드"
        description="클릭하거나 파일을 여기에 드래그"
      />

      {state.showMapper && state.headers.length > 0 && (
        <div className="mt-5 space-y-4">
          {/* 기간 선택기 */}
          {periodSelector && (
            <div className="p-3 bg-orange-50 rounded-xl border border-orange-100">
              {periodSelector}
            </div>
          )}

          {/* 피벗(Wide) 형태 매장 목록 표시 */}
          {wideStoreInfo && wideStoreInfo.length > 0 && (
            <div className="p-3 bg-green-50 rounded-xl border border-green-100">
              <p className="text-xs font-semibold text-green-700 mb-1.5">
                감지된 매장 ({wideStoreInfo.length}개)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {wideStoreInfo.map((col) => (
                  <span key={col} className="text-xs bg-white border border-green-200 text-green-800 px-2 py-0.5 rounded-full">
                    {col.replace(/^[A-Z]+\d+_/, '')}
                  </span>
                ))}
              </div>
            </div>
          )}

          <ColumnMapper
            headers={state.headers}
            mapping={state.mapping}
            onChange={(m) => setState((s) => ({ ...s, mapping: m }))}
            showFields={showFields}
          />

          {/* 미리보기 */}
          {state.preview.length > 0 && (
            <details className="group">
              <summary className="text-xs text-gray-500 cursor-pointer flex items-center gap-1 list-none">
                <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                데이터 미리보기 (5행)
              </summary>
              <div className="mt-2 overflow-x-auto border border-gray-100 rounded-xl">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      {state.headers.slice(0, 8).map((h) => (
                        <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {state.preview.map((row, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        {state.headers.slice(0, 8).map((h) => (
                          <td key={h} className="px-3 py-1.5 text-gray-700 whitespace-nowrap max-w-[120px] truncate">
                            {row[h] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <button
            onClick={onCommit}
            disabled={!canCommit}
            className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {canCommit ? '저장 및 적용' : '필수 컬럼을 매핑해주세요 (*)'}
          </button>
        </div>
      )}
    </div>
  )
}
