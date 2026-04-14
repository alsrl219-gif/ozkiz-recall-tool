import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Upload,
  Store,
  BarChart3,
  History,
  Settings,
  Menu,
  X,
  RefreshCw,
  ChevronRight,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Users,
} from 'lucide-react'
import { cn } from '../utils/helpers'
import { useAppStore } from '../store/useAppStore'
import { supabase, SESSION_ID } from '../lib/supabase'
import { getMyLastSavedAt } from '../store/cloudStorage'

const NAV_ITEMS = [
  { to: '/', label: '대시보드', icon: LayoutDashboard, exact: true },
  { to: '/upload', label: '데이터 업로드', icon: Upload },
  { to: '/stores', label: '매장별 현황', icon: Store },
  { to: '/analytics', label: '분석', icon: BarChart3 },
  { to: '/history', label: '회수 이력', icon: History },
  { to: '/settings', label: '설정', icon: Settings },
  { to: '/guide', label: '사용 설명서', icon: BookOpen },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'synced' | 'syncing'>('idle')
  const location = useLocation()
  const generateRecalls = useAppStore((s) => s.generateRecalls)

  // 실시간 동기화: 다른 사람이 데이터를 바꾸면 자동으로 내 화면도 갱신
  useEffect(() => {
    const channel = supabase
      .channel('app-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_data' },
        async (payload: { new?: { session_id?: string; updated_at?: string } }) => {
          const remote = payload.new
          // 내가 저장한 업데이트면 무시 (루프 방지)
          if (remote?.session_id === SESSION_ID) return
          // 내가 방금 저장한 것과 타임스탬프가 같으면 무시
          if (remote?.updated_at && remote.updated_at === getMyLastSavedAt()) return

          setSyncStatus('syncing')
          await useAppStore.persist.rehydrate()
          setSyncStatus('synced')
          setTimeout(() => setSyncStatus('idle'), 3000)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])
  const recallItems = useAppStore((s) => s.recallItems)
  const urgentCount = recallItems.filter(
    (r) => r.priority === 'urgent' && r.status === 'recommended'
  ).length

  function runAnalysis() {
    if (analyzing) return
    setAnalyzing(true)
    setSidebarOpen(false)
    setTimeout(() => {
      generateRecalls()
      const count = useAppStore.getState().recallItems.length
      setAnalyzing(false)
      if (count > 0) {
        setToast({ msg: `분석 완료 · ${count}건 생성됨`, ok: true })
      } else {
        setToast({ msg: '결과 없음 · 온라인 판매 데이터 확인', ok: false })
      }
      setTimeout(() => setToast(null), 5000)
    }, 600)
  }

  return (
    <div className="flex h-screen bg-[#FFF8F3] overflow-hidden">
      {/* 모바일 오버레이 */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={cn(
          'fixed lg:relative inset-y-0 left-0 z-30 w-60 bg-white border-r border-gray-100 flex flex-col transition-transform duration-200',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* 로고 */}
        <div className="h-14 flex items-center gap-3 px-5 border-b border-gray-100">
          <span className="text-2xl leading-none flex-shrink-0">🚚</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-gray-900 tracking-tight leading-none">OZKIZ</div>
            <div className="text-[9px] text-brand-500 font-semibold tracking-widest uppercase mt-0.5">Recall Tool</div>
          </div>
          {/* 실시간 동기화 상태 */}
          <div title={syncStatus === 'syncing' ? '동기화 중...' : syncStatus === 'synced' ? '동기화 완료' : '공유 모드'}>
            <Users className={cn(
              'w-3.5 h-3.5 flex-shrink-0 transition-colors',
              syncStatus === 'syncing' ? 'text-amber-400 animate-pulse' :
              syncStatus === 'synced' ? 'text-green-500' : 'text-gray-300'
            )} />
          </div>
          <button
            className="lg:hidden text-gray-400 hover:text-gray-700 p-0.5"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all group',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'w-4 h-4 flex-shrink-0 transition-colors',
                      isActive ? 'text-brand-500' : 'text-gray-400 group-hover:text-gray-600'
                    )}
                  />
                  <span className="flex-1 truncate">{label}</span>
                  {to === '/' && urgentCount > 0 && (
                    <span className="text-[10px] font-bold bg-red-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {urgentCount}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-3 h-3 text-brand-400 flex-shrink-0" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 분석 실행 버튼 */}
        <div className="p-3 border-t border-gray-100 space-y-2">
          {toast && (
            <div
              className={cn(
                'flex items-start gap-2 px-3 py-2 rounded-xl text-xs font-medium',
                toast.ok
                  ? 'bg-green-50 text-green-700'
                  : 'bg-amber-50 text-amber-700'
              )}
            >
              {toast.ok
                ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              }
              <span className="leading-relaxed">{toast.msg}</span>
            </div>
          )}
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-semibold rounded-xl transition-all',
              analyzing
                ? 'bg-brand-400 cursor-not-allowed'
                : 'bg-brand-500 hover:bg-brand-600 active:scale-[0.98]'
            )}
          >
            <RefreshCw className={cn('w-4 h-4 flex-shrink-0', analyzing && 'animate-spin')} />
            {analyzing ? '분석 중...' : '회수 분석 실행'}
          </button>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 상단 바 */}
        <header className="h-14 bg-white border-b border-gray-100 flex items-center px-4 lg:px-6 gap-4 flex-shrink-0 shadow-sm">
          <button
            className="lg:hidden text-gray-500 hover:text-gray-900 p-1"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <PageTitle location={location.pathname} />
          <div className="ml-auto text-xs text-gray-400 tabular-nums">
            {new Date().toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        </header>

        {/* 페이지 */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

function PageTitle({ location: path }: { location: string }) {
  const labels: Record<string, string> = {
    '/': '대시보드',
    '/upload': '데이터 업로드',
    '/stores': '매장별 현황',
    '/analytics': '분석',
    '/history': '회수 이력',
    '/settings': '설정',
    '/guide': '사용 설명서',
  }
  return (
    <h1 className="text-sm font-semibold text-gray-900">
      {labels[path] ?? '대시보드'}
    </h1>
  )
}
