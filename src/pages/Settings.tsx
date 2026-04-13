import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, RotateCcw, HelpCircle, Bot, CheckCircle, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { DEFAULT_SETTINGS } from '../types'
import type { Store } from '../types'
import { cn } from '../utils/helpers'

const SERVER_URL = 'http://localhost:3001'

export default function Settings() {
  const { settings, updateSettings } = useAppStore()
  const [form, setForm] = useState({ ...settings })
  const [saved, setSaved] = useState(false)
  const [newStore, setNewStore] = useState<Partial<Store>>({})

  function handleSave() {
    updateSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleReset() {
    if (window.confirm('설정을 기본값으로 초기화하시겠습니까?')) {
      setForm({ ...DEFAULT_SETTINGS, stores: form.stores })
    }
  }

  function addStore() {
    if (!newStore.id || !newStore.name) return
    const store: Store = {
      id: newStore.id.trim(),
      name: newStore.name.trim(),
      region: newStore.region?.trim() ?? '',
      phone: newStore.phone?.trim(),
    }
    setForm((f) => ({ ...f, stores: [...f.stores, store] }))
    setNewStore({})
  }

  function removeStore(id: string) {
    setForm((f) => ({ ...f, stores: f.stores.filter((s) => s.id !== id) }))
  }

  const totalWeight = form.weights.onlineDemand + form.weights.centerDepletion + form.weights.storeStagnation

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      {/* 시즌 설정 */}
      <Section title="시즌 설정" subtitle="현재 판매 시즌 기간을 설정합니다">
        <Field label="시즌 종료일" hint="이 날짜가 가까울수록 회수 우선순위가 높아집니다">
          <input
            type="date"
            value={form.seasonEndDate}
            onChange={(e) => setForm((f) => ({ ...f, seasonEndDate: e.target.value }))}
            className="input"
          />
        </Field>
        <Field label="분석 기간 (일)" hint="판매 속도 계산에 사용할 최근 N일">
          <input
            type="number"
            value={form.analysisWindowDays}
            min={7} max={180}
            onChange={(e) => setForm((f) => ({ ...f, analysisWindowDays: parseInt(e.target.value) || 30 }))}
            className="input w-32"
          />
        </Field>
      </Section>

      {/* 우선순위 임계값 */}
      <Section title="우선순위 임계값" subtitle="회수 점수 기준으로 우선순위를 구분합니다 (0–100)">
        <div className="grid grid-cols-3 gap-4">
          <Field label="긴급 기준 (이상)">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
              <input
                type="number"
                value={form.urgentScoreThreshold}
                min={0} max={100}
                onChange={(e) => setForm((f) => ({ ...f, urgentScoreThreshold: parseInt(e.target.value) || 80 }))}
                className="input w-20"
              />
            </div>
          </Field>
          <Field label="높음 기준 (이상)">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0" />
              <input
                type="number"
                value={form.highScoreThreshold}
                min={0} max={100}
                onChange={(e) => setForm((f) => ({ ...f, highScoreThreshold: parseInt(e.target.value) || 60 }))}
                className="input w-20"
              />
            </div>
          </Field>
          <Field label="보통 기준 (이상)">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 flex-shrink-0" />
              <input
                type="number"
                value={form.mediumScoreThreshold}
                min={0} max={100}
                onChange={(e) => setForm((f) => ({ ...f, mediumScoreThreshold: parseInt(e.target.value) || 40 }))}
                className="input w-20"
              />
            </div>
          </Field>
        </div>
      </Section>

      {/* 분석 가중치 */}
      <Section
        title="분석 가중치"
        subtitle={`세 항목의 합계가 1.0이어야 합니다. 현재: ${totalWeight.toFixed(2)} ${Math.abs(totalWeight - 1) > 0.01 ? '⚠️ 합계 오류' : '✓'}`}
      >
        <div className="space-y-4">
          <WeightField
            label="온라인 수요 강도"
            desc="최근 온라인 채널 판매 속도"
            value={form.weights.onlineDemand}
            onChange={(v) => setForm((f) => ({ ...f, weights: { ...f.weights, onlineDemand: v } }))}
          />
          <WeightField
            label="센터 재고 소진도"
            desc="센터 재고 부족 정도"
            value={form.weights.centerDepletion}
            onChange={(v) => setForm((f) => ({ ...f, weights: { ...f.weights, centerDepletion: v } }))}
          />
          <WeightField
            label="매장 재고 정체도"
            desc="매장 판매율이 낮을수록 높음"
            value={form.weights.storeStagnation}
            onChange={(v) => setForm((f) => ({ ...f, weights: { ...f.weights, storeStagnation: v } }))}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <div className="h-2 rounded-full overflow-hidden flex flex-1">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${form.weights.onlineDemand * 100}%` }} />
            <div className="h-full bg-orange-400 transition-all" style={{ width: `${form.weights.centerDepletion * 100}%` }} />
            <div className="h-full bg-yellow-400 transition-all" style={{ width: `${form.weights.storeStagnation * 100}%` }} />
          </div>
        </div>
      </Section>

      {/* 매장 관리 */}
      <Section title="매장 관리" subtitle="이지체인 데이터 업로드 시 자동 등록됩니다. 직접 추가도 가능합니다.">
        {/* 추가 폼 */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            placeholder="매장코드 *"
            value={newStore.id ?? ''}
            onChange={(e) => setNewStore((s) => ({ ...s, id: e.target.value }))}
            className="input flex-1 min-w-[100px]"
          />
          <input
            placeholder="매장명 *"
            value={newStore.name ?? ''}
            onChange={(e) => setNewStore((s) => ({ ...s, name: e.target.value }))}
            className="input flex-1 min-w-[120px]"
          />
          <input
            placeholder="지역"
            value={newStore.region ?? ''}
            onChange={(e) => setNewStore((s) => ({ ...s, region: e.target.value }))}
            className="input flex-1 min-w-[80px]"
          />
          <input
            placeholder="전화번호"
            value={newStore.phone ?? ''}
            onChange={(e) => setNewStore((s) => ({ ...s, phone: e.target.value }))}
            className="input flex-1 min-w-[120px]"
          />
          <button
            onClick={addStore}
            disabled={!newStore.id || !newStore.name}
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> 추가
          </button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {form.stores.length === 0 ? (
            <div className="text-sm text-gray-400 text-center py-4">등록된 매장이 없습니다</div>
          ) : (
            form.stores.map((store) => (
              <div
                key={store.id}
                className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{store.name}</div>
                  <div className="text-xs text-gray-400">
                    {store.id}{store.region ? ` · ${store.region}` : ''}{store.phone ? ` · ${store.phone}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => removeStore(store.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </Section>

      {/* 자동화 설정 */}
      <AutomationSection />

      {/* 데이터 초기화 */}
      <Section title="데이터 관리" subtitle="앱에 저장된 데이터를 관리합니다">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              if (window.confirm('저장된 모든 데이터(재고, 판매, 회수이력)를 삭제하시겠습니까?')) {
                useAppStore.getState().setCenterStocks([])
                useAppStore.getState().setStoreStocks([])
                useAppStore.getState().clearSalesByChannel('online')
                useAppStore.getState().clearSalesByChannel('offline')
                useAppStore.getState().clearSalesByChannel('coupang')
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 text-sm font-medium rounded-xl hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" /> 재고·판매 데이터 초기화
          </button>
        </div>
      </Section>

      {/* 저장 버튼 */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
        >
          <RotateCcw className="w-4 h-4" /> 기본값 복원
        </button>
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          <Save className="w-4 h-4" />
          {saved ? '저장됨 ✓' : '설정 저장'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5">
      <div className="mb-4">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        {subtitle && <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-gray-600">{label}</label>
        {hint && (
          <span title={hint} className="cursor-help">
            <HelpCircle className="w-3.5 h-3.5 text-gray-300" />
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function WeightField({
  label, desc, value, onChange,
}: {
  label: string; desc: string; value: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <div className="text-xs font-medium text-gray-700">{label}</div>
        <div className="text-xs text-gray-400">{desc}</div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0} max={1} step={0.05}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-24 accent-brand-500"
        />
        <span className="text-sm font-mono text-gray-700 w-8">{value.toFixed(2)}</span>
      </div>
    </div>
  )
}

// ─── 자동화 설정 섹션 ────────────────────────────────────────────
interface SiteFormData {
  url: string
  id: string
  pw: string
  downloadBtnText: string  // 다운로드 버튼에 쓰인 텍스트
  menuText: string         // 해당 메뉴 이름
}

const SITE_DEFAULTS: Record<string, SiteFormData> = {
  ezadmin: { url: '', id: '', pw: '', downloadBtnText: '다운로드', menuText: '현재고조회' },
  ezchain: { url: '', id: '', pw: '', downloadBtnText: '다운로드', menuText: '매장재고' },
  coupang: { url: 'https://wing.coupang.com', id: '', pw: '', downloadBtnText: '다운로드', menuText: '판매내역' },
}

const SITE_LABELS: Record<string, string> = {
  ezadmin: '이지어드민',
  ezchain: '이지체인',
  coupang: '쿠팡 Wing',
}

function AutomationSection() {
  const [serverOnline, setServerOnline] = useState<boolean | null>(null)
  const [forms, setForms] = useState<Record<string, SiteFormData>>(SITE_DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [testState, setTestState] = useState<Record<string, { loading: boolean; screenshot?: string; error?: string }>>({})
  const [showPw, setShowPw] = useState<Record<string, boolean>>({})

  // 서버 연결 확인 + 기존 설정 불러오기
  useEffect(() => {
    fetch(`${SERVER_URL}/api/status`, { signal: AbortSignal.timeout(3000) })
      .then(async (r) => {
        setServerOnline(r.ok)
        if (r.ok) {
          // 기존 설정 불러오기
          const cfg = await fetch(`${SERVER_URL}/api/config`).then(r => r.json()).catch(() => ({}))
          setForms((prev) => {
            const next = { ...prev }
            for (const site of ['ezadmin', 'ezchain', 'coupang'] as const) {
              if (cfg[site]) {
                next[site] = {
                  url: cfg[site].url ?? prev[site].url,
                  id: cfg[site].id ?? '',
                  pw: cfg[site].pw ?? '',
                  downloadBtnText: cfg[site].stockDownloadText ?? cfg[site].salesDownloadText ?? prev[site].downloadBtnText,
                  menuText: cfg[site].stockMenuText ?? cfg[site].storeMenuText ?? prev[site].menuText,
                }
              }
            }
            return next
          })
        }
      })
      .catch(() => setServerOnline(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    try {
      const body = {
        ezadmin: {
          url: forms.ezadmin.url, id: forms.ezadmin.id, pw: forms.ezadmin.pw,
          stockMenuText: forms.ezadmin.menuText, stockDownloadText: forms.ezadmin.downloadBtnText,
          salesMenuText: '어드민상품매출통계', salesDownloadText: forms.ezadmin.downloadBtnText,
        },
        ezchain: {
          url: forms.ezchain.url, id: forms.ezchain.id, pw: forms.ezchain.pw,
          storeMenuText: forms.ezchain.menuText, storeDownloadText: forms.ezchain.downloadBtnText,
        },
        coupang: {
          url: forms.coupang.url, id: forms.coupang.id, pw: forms.coupang.pw,
        },
      }
      const res = await fetch(`${SERVER_URL}/api/config`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaveMsg('저장 완료 ✓')
    } catch (e) {
      setSaveMsg(`저장 실패: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest(site: string) {
    setTestState((s) => ({ ...s, [site]: { loading: true } }))
    try {
      const res = await fetch(`${SERVER_URL}/api/test/${site}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTestState((s) => ({ ...s, [site]: { loading: false, screenshot: data.screenshot } }))
    } catch (e) {
      setTestState((s) => ({ ...s, [site]: { loading: false, error: String(e) } }))
    }
  }

  if (serverOnline === false) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="w-4 h-4 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900">자동화 설정</h3>
        </div>
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl text-sm text-gray-500">
          <AlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <div>
            <div className="font-medium">자동화 서버가 연결되지 않았습니다</div>
            <div className="text-xs mt-0.5">시놀로지 NAS에 서버를 먼저 설치하세요 → <code className="bg-gray-200 px-1 rounded">server/SETUP.md</code> 참고</div>
          </div>
        </div>
      </div>
    )
  }

  if (serverOnline === null) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5 flex items-center gap-3 text-sm text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" /> 서버 연결 확인 중...
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Bot className="w-4 h-4 text-brand-500" />
        <h3 className="text-sm font-semibold text-gray-900">자동화 설정</h3>
        <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
          <CheckCircle className="w-3 h-3" /> 서버 연결됨
        </span>
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        각 사이트의 계정 정보와 버튼 이름을 입력하세요. 연결 테스트를 누르면 실제 사이트 화면을 확인할 수 있습니다.
      </p>

      {(['ezadmin', 'ezchain', 'coupang'] as const).map((site) => (
        <SiteConfigCard
          key={site}
          site={site}
          label={SITE_LABELS[site]}
          form={forms[site]}
          showPw={showPw[site] ?? false}
          testResult={testState[site]}
          onChange={(f) => setForms((s) => ({ ...s, [site]: f }))}
          onTogglePw={() => setShowPw((s) => ({ ...s, [site]: !s[site] }))}
          onTest={() => handleTest(site)}
        />
      ))}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          서버에 저장
        </button>
        {saveMsg && (
          <span className={cn('text-xs', saveMsg.includes('실패') ? 'text-red-500' : 'text-green-600')}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  )
}

function SiteConfigCard({
  site, label, form, showPw, testResult, onChange, onTogglePw, onTest,
}: {
  site: string
  label: string
  form: SiteFormData
  showPw: boolean
  testResult?: { loading: boolean; screenshot?: string; error?: string }
  onChange: (f: SiteFormData) => void
  onTogglePw: () => void
  onTest: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-sm font-semibold text-gray-800">{label}</span>
        {form.id ? (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">설정됨</span>
        ) : (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">미설정</span>
        )}
        <span className="ml-auto text-xs text-gray-400">{open ? '접기' : '설정'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          {site !== 'coupang' && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">사이트 URL</label>
              <input
                value={form.url}
                onChange={(e) => onChange({ ...form, url: e.target.value })}
                placeholder={`https://회사명.${site}.co.kr`}
                className="input w-full text-sm"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">아이디</label>
              <input
                value={form.id}
                onChange={(e) => onChange({ ...form, id: e.target.value })}
                placeholder="로그인 아이디"
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">비밀번호</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.pw}
                  onChange={(e) => onChange({ ...form, pw: e.target.value })}
                  placeholder="비밀번호"
                  className="input w-full text-sm pr-8"
                />
                <button
                  onClick={onTogglePw}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {site !== 'coupang' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  메뉴 이름 <span className="text-gray-400 font-normal">(화면에 표시된 텍스트)</span>
                </label>
                <input
                  value={form.menuText}
                  onChange={(e) => onChange({ ...form, menuText: e.target.value })}
                  placeholder="예: 현재고조회"
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  다운로드 버튼 텍스트
                </label>
                <input
                  value={form.downloadBtnText}
                  onChange={(e) => onChange({ ...form, downloadBtnText: e.target.value })}
                  placeholder="예: 다운로드, 엑셀, CSV"
                  className="input w-full text-sm"
                />
              </div>
            </div>
          )}

          {/* 연결 테스트 */}
          <div>
            <button
              onClick={onTest}
              disabled={testResult?.loading || !form.id}
              className="flex items-center gap-2 px-3 py-2 border border-brand-200 text-brand-700 text-xs font-semibold rounded-lg hover:bg-brand-50 transition-colors disabled:opacity-50"
            >
              {testResult?.loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle className="w-3.5 h-3.5" />
              )}
              연결 테스트 (화면 미리보기)
            </button>

            {testResult?.error && (
              <div className="mt-2 flex items-center gap-2 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5" /> {testResult.error}
              </div>
            )}

            {testResult?.screenshot && (
              <div className="mt-3">
                <div className="text-xs text-gray-500 mb-1">사이트 화면 (로그인 시도 후)</div>
                <img
                  src={testResult.screenshot}
                  alt="사이트 스크린샷"
                  className="w-full rounded-xl border border-gray-200 object-cover"
                  style={{ maxHeight: 280 }}
                />
                <div className="text-xs text-gray-400 mt-1">
                  로그인이 성공했다면 메인 화면이, 실패했다면 로그인 화면이 보입니다.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
