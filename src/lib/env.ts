function 필수(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`환경변수 ${name} 가 설정되지 않았습니다. .env.local 을 확인하세요.`)
  }
  return value
}

export function getPublicEnv() {
  return {
    supabaseUrl: 필수('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: 필수('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  }
}

/**
 * service role 키는 RLS를 통째로 우회한다. 브라우저로 새어나가면 안 되므로
 * 값을 읽기 전에 실행 환경부터 확인한다.
 */
export function getServiceRoleKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error('service role 키는 브라우저에서 접근할 수 없습니다')
  }
  return 필수('SUPABASE_SERVICE_ROLE_KEY')
}

/** Gemini API 키. 브라우저로 새어나가면 제3자가 무료 한도를 소진시킬 수 있다. */
export function getGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error('Gemini API 키는 브라우저에서 접근할 수 없습니다')
  }
  return 필수('GEMINI_API_KEY')
}

/** 크론 인증용 비밀값. */
export function getCronSecret(): string {
  if (typeof window !== 'undefined') {
    throw new Error('CRON_SECRET은 브라우저에서 접근할 수 없습니다')
  }
  return 필수('CRON_SECRET')
}
