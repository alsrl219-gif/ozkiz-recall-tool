import { createClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const env = (import.meta as any).env

export const supabase = createClient(
  env.VITE_SUPABASE_URL as string,
  env.VITE_SUPABASE_ANON_KEY as string
)

// 이 세션에서 발생한 저장인지 구분하는 고유 ID (실시간 루프 방지)
export const SESSION_ID = Math.random().toString(36).slice(2, 10)
