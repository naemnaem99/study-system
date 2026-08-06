import { NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { digestFileName, hasDigestContent } from '@/lib/digest'

export async function GET(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { date } = await params
  const supabase = await createSupabaseServerClient()
  const { data: digest } = await supabase
    .from('digests')
    .select('body_md, status')
    .eq('digest_date', date)
    .maybeSingle()

  if (!hasDigestContent(digest)) {
    return NextResponse.json({ error: '정리본을 찾을 수 없습니다' }, { status: 404 })
  }

  const 파일명 = digestFileName(date)
  // 파일명에 한글이 들어가므로 RFC 5987 형식을 쓴다. filename= 만 쓰면
  // 브라우저에 따라 이름이 깨진다(설계 §8.3).
  return new NextResponse(digest.body_md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(파일명)}`,
    },
  })
}
