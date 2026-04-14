import { supabase, SESSION_ID } from '../lib/supabase'

const TABLE = 'app_data'
let _debounceTimer: ReturnType<typeof setTimeout> | null = null

// 내가 방금 저장한 업데이트인지 판단하는 플래그 (실시간 루프 방지)
let _myLastSavedAt = ''

export function getMyLastSavedAt() { return _myLastSavedAt }

export const cloudStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('state')
        .eq('id', name)
        .single()
      // PGRST116 = row not found (정상)
      if (error && error.code !== 'PGRST116') throw error
      return data?.state ?? null
    } catch {
      return null
    }
  },

  setItem: (_name: string, value: string): void => {
    if (_debounceTimer) clearTimeout(_debounceTimer)
    _debounceTimer = setTimeout(async () => {
      try {
        const now = new Date().toISOString()
        _myLastSavedAt = now
        await supabase.from(TABLE).upsert({
          id: _name,
          state: value,
          session_id: SESSION_ID,
          updated_at: now,
        })
      } catch {
        // 저장 실패 시 무시 (다음 변경 시 재시도)
      }
    }, 1500)
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      await supabase.from(TABLE).delete().eq('id', name)
    } catch {}
  },
}
