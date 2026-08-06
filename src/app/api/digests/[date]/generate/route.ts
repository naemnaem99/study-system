import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { runDigestPipeline } from '@/lib/digest-pipeline'

const 날짜형식 = /^\d{4}-\d{2}-\d{2}$/

/**
 * 이 라우트는 (app) 레이아웃 밖이라 requireProfile의 리다이렉트가 걸리지
 * 않는다. getCurrentProfile로 직접 확인한다(설계 §8.1.1).
 */
export async function POST(req: Request, { params }: { params: Promise<{ date: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { date } = await params
  if (!날짜형식.test(date)) {
    return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다' }, { status: 400 })
  }

  // 요청 본문이 없으면(기존 클라이언트) force=false로 취급한다.
  const force = await req.json().then((body) => Boolean(body?.force)).catch(() => false)

  const result = await runDigestPipeline(date, { force })
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, skipped: result.skipped, reason: result.reason })
}
