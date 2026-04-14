import { get, set, del } from 'idb-keyval'
import { supabase, SESSION_ID, isSupabaseEnabled } from '../lib/supabase'

const TABLE = 'app_data'
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _myLastSavedAt = ''

export function getMyLastSavedAt() { return _myLastSavedAt }

/**
 * Supabase에서 직접 최신 데이터를 가져와 IndexedDB 캐시도 갱신
 * (실시간 동기화 이벤트 수신 시 사용)
 */
export async function fetchLatestFromSupabase(name: string): Promise<string | null> {
  if (!isSupabaseEnabled) return null
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('state')
      .eq('id', name)
      .single()
    if (error && error.code !== 'PGRST116') return null
    if (data?.state) {
      // IndexedDB 캐시 갱신
      set(name, data.state).catch(() => {})
      return data.state
    }
  } catch {}
  return null
}

export const cloudStorage = {
  /**
   * 1순위: IndexedDB (즉시 반환 → 빠른 초기 로딩)
   * 2순위: Supabase (IndexedDB 비어있을 때만 — 첫 방문)
   */
  getItem: async (name: string): Promise<string | null> => {
    // 로컬 캐시 먼저 확인 (거의 즉시)
    const local = await get<string>(name).catch(() => null)
    if (local) return local

    // 로컬에 없으면 Supabase에서 가져오기 (첫 방문 or 캐시 삭제된 경우)
    return fetchLatestFromSupabase(name)
  },

  /**
   * IndexedDB에 즉시 저장(반응성) + Supabase에 디바운스로 동기화(공유)
   */
  setItem: (name: string, value: string): void => {
    // IndexedDB는 즉시 저장 (새로고침해도 빠르게 복원)
    set(name, value).catch(() => {})

    // Supabase는 1.5초 디바운스 (빠른 연속 변경 시 한 번만 전송)
    if (!isSupabaseEnabled) return
    if (_debounceTimer) clearTimeout(_debounceTimer)
    _debounceTimer = setTimeout(async () => {
      try {
        const now = new Date().toISOString()
        _myLastSavedAt = now
        await supabase.from(TABLE).upsert({
          id: name,
          state: value,
          session_id: SESSION_ID,
          updated_at: now,
        })
      } catch {
        // Supabase 저장 실패해도 로컬(IndexedDB)에는 이미 저장됨
      }
    }, 1500)
  },

  removeItem: async (name: string): Promise<void> => {
    del(name).catch(() => {})
    if (!isSupabaseEnabled) return
    try { await supabase.from(TABLE).delete().eq('id', name) } catch {}
  },
}
