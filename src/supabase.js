import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, IS_CONFIGURED } from './config.js';

// anon 키는 공개 정보입니다. 접근 통제는 전적으로 DB의 RLS가 담당합니다.
// service_role 키는 어떤 경우에도 이 파일/프런트엔드에 넣지 마세요.
export const supabase = IS_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
