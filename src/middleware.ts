import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const 공개경로 = ['/login', '/no-access']

export async function middleware(request: NextRequest) {
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

  const path = request.nextUrl.pathname
  if (!user && !공개경로.includes(path)) {
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
