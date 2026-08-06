import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const 공개경로 = ['/login', '/no-access']

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // 로그인·권한 안내 화면은 Supabase 연결 없이도 렌더링할 수 있어야 한다.
  // 공개 경로에서 먼저 클라이언트를 만들면 환경변수 설정 오류가 로그인 화면까지
  // 500으로 막아, 사용자가 설정 문제를 복구할 진입점 자체가 사라진다.
  if (공개경로.includes(path)) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getUser()를 호출해야 만료된 세션이 갱신된다.
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // /api 는 뺀다. 각 API 라우트가 자체적으로 인증한다(설계 §8.1.1) — 크론처럼
  // 세션 쿠키가 아예 없는 호출자도 있어서, 미들웨어가 먼저 /login으로
  // 리다이렉트해버리면 라우트 핸들러가 CRON_SECRET을 검사할 기회조차 없다.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
