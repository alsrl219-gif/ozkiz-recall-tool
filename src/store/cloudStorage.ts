import { supabase, SESSION_ID, isSupabaseEnabled } from '../lib/supabase'
import { get, set, del } from 'idb-keyval'

const TABLE = 'app_data'
let _debounceTimer: ReturnType<typeof setTimeout> | null = null
let _myLastSavedAt = ''

export function getMyLastSavedAt() { return _myLastSavedAt }

export const cloudStorage = {
  getItem: async (name: string): Promise<string | null> => {
    // Supabase 미설정 시 IndexedDB 폴백
    if (!isSupabaseEnabled) {
      return get<string>(name).then((v) => v ?? null).catch(() => null)
    }
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('state')
        .eq('id', name)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return data?.state ?? null
    } catch {
      // Supabase 실패 시 IndexedDB 폴백
      return get<string>(name).then((v) => v ?? null).catch(() => null)
    }
  },

  setItem: (name: string, value: string): void => {
    if (_debounceTimer) clearTimeout(_debounceTimer)
    _debounceTimer = setTimeout(async () => {
      if (!isSupabaseEnabled) {
        set(name, value).catch(() => {})
        return
      }
      try {
        const now = new Date().toISOString()
        _myLastSavedAt = now
        await supabase.from(TABLE).upsert({
          id: name,
          state: value,
          session_id: SESSION_ID,
          updated_at: now,
        })
        // Supabase 성공 시 IndexedDB에도 백업
        set(name, value).catch(() => {})
      } catch {
        // Supabase 실패 시 IndexedDB에만 저장
        set(name, value).catch(() => {})
      }
    }, 1500)
  },

  removeItem: async (name: string): Promise<void> => {
    del(name).catch(() => {})
    if (!isSupabaseEnabled) return
    try {
      await supabase.from(TABLE).delete().eq('id', name)
    } catch {}
  },
}
