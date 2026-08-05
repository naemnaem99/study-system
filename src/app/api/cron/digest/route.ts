import { NextResponse } from 'next/server'
import { getCronSecret } from '@/lib/env'
import { todayInSeoul } from '@/lib/date'
import { runDigestPipeline } from '@/lib/digest-pipeline'

/**
 * Vercel Cron은 이 라우트를 'Authorization: Bearer $CRON_SECRET' 헤더로 호출한다.
 * 대상 날짜는 반드시 KST로 구한다 — 크론은 UTC로 실행되므로 서버 기본 날짜를
 * 그대로 쓰면 실행 시각이 바뀌는 순간 조용히 전날 정리본을 만들게 된다(설계 §8.1).
 */
export async function POST(req: Request) {
  const 헤더값 = req.headers.get('authorization')
  if (헤더값 !== `Bearer ${getCronSecret()}`) {
    return NextResponse.json({ error: '인증되지 않았습니다' }, { status: 401 })
  }

  const date = todayInSeoul()
  const result = await runDigestPipeline(date)
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, skipped: result.skipped })
}
