import { describe, it, expect } from 'vitest'
import {
  parseAiResponse,
  filterValidConnections,
  assembleDigestMarkdown,
  digestFileName,
  hasDigestContent,
} from '@/lib/digest'

describe('hasDigestContent', () => {
  it('body_md가 있으면 status가 failed여도 true를 반환한다 (재생성 실패로 status만 failed가 된 경우)', () => {
    expect(hasDigestContent({ body_md: '# 이전 정리본' })).toBe(true)
  })

  it('body_md가 없으면 false를 반환한다', () => {
    expect(hasDigestContent({ body_md: null })).toBe(false)
  })

  it('digest 자체가 없으면 false를 반환한다', () => {
    expect(hasDigestContent(null)).toBe(false)
    expect(hasDigestContent(undefined)).toBe(false)
  })
})

describe('parseAiResponse', () => {
  const 정상 = {
    one_liner: '오늘은 다들 알고리즘을 공부했다',
    members: [{ profile_slug: 'jiho', summary: '이분 탐색 정리' }],
    connections: [],
  }

  it('정상 응답을 통과시킨다', () => {
    expect(parseAiResponse(정상).ok).toBe(true)
  })

  it('객체가 아니면 거부한다', () => {
    expect(parseAiResponse('문자열').ok).toBe(false)
    expect(parseAiResponse(null).ok).toBe(false)
  })

  it('one_liner가 없으면 거부한다', () => {
    const r = parseAiResponse({ ...정상, one_liner: undefined })
    expect(r.ok).toBe(false)
  })

  it('one_liner가 빈 문자열이면 거부한다', () => {
    expect(parseAiResponse({ ...정상, one_liner: '   ' }).ok).toBe(false)
  })

  it('members가 배열이 아니면 거부한다', () => {
    expect(parseAiResponse({ ...정상, members: 'x' }).ok).toBe(false)
  })

  it('members가 비어 있으면 거부한다', () => {
    expect(parseAiResponse({ ...정상, members: [] }).ok).toBe(false)
  })

  it('members 항목에 summary가 없으면 거부한다', () => {
    expect(parseAiResponse({ ...정상, members: [{ profile_slug: 'jiho' }] }).ok).toBe(false)
  })

  it('connections가 배열이 아니면 거부한다', () => {
    expect(parseAiResponse({ ...정상, connections: 'x' }).ok).toBe(false)
  })

  it('connections의 member_slugs에 문자열이 아닌 값이 있으면 거부한다', () => {
    const r = parseAiResponse({
      ...정상,
      connections: [{ title: 't', detail: 'd', member_slugs: [1, 2] }],
    })
    expect(r.ok).toBe(false)
  })
})

describe('filterValidConnections', () => {
  const 오늘 = new Set(['jiho', 'minsu'])

  it('2명 이상이고 전원이 그날 올린 사람이면 통과시킨다', () => {
    const r = filterValidConnections(
      [{ title: 't', detail: 'd', member_slugs: ['jiho', 'minsu'] }],
      오늘,
    )
    expect(r).toHaveLength(1)
  })

  it('1명뿐이면 거부한다', () => {
    const r = filterValidConnections([{ title: 't', detail: 'd', member_slugs: ['jiho'] }], 오늘)
    expect(r).toHaveLength(0)
  })

  it('그날 올리지 않은 사람이 섞여 있으면 거부한다', () => {
    const r = filterValidConnections(
      [{ title: 't', detail: 'd', member_slugs: ['jiho', 'seoyeon'] }],
      오늘,
    )
    expect(r).toHaveLength(0)
  })

  it('여러 항목 중 유효한 것만 남긴다', () => {
    const r = filterValidConnections(
      [
        { title: '유효', detail: 'd', member_slugs: ['jiho', 'minsu'] },
        { title: '무효', detail: 'd', member_slugs: ['jiho'] },
      ],
      오늘,
    )
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('유효')
  })
})

describe('assembleDigestMarkdown', () => {
  const 기본 = {
    date: '2026-08-05',
    oneLiner: '한 줄 요약',
    members: [{ slug: 'jiho', displayName: '지호', summary: '요약' }],
    connections: [],
  }

  it('제목에 날짜가 들어간다', () => {
    expect(assembleDigestMarkdown(기본)).toContain('# 2026-08-05 스터디 정리')
  })

  it('팀원 이름이 저장소 링크로 들어간다', () => {
    expect(assembleDigestMarkdown(기본)).toContain('[지호](/members/jiho)')
  })

  it('연결이 없으면 겹치는 지점 섹션이 나타나지 않는다', () => {
    expect(assembleDigestMarkdown(기본)).not.toContain('겹치는 지점')
  })

  it('연결이 있으면 겹치는 지점 섹션이 나타난다', () => {
    const md = assembleDigestMarkdown({
      ...기본,
      connections: [{ title: '공통 주제', detail: '둘 다 트리를 다뤘다', memberNames: ['지호', '민수'] }],
    })
    expect(md).toContain('## 겹치는 지점')
    expect(md).toContain('### 공통 주제')
    expect(md).toContain('(지호, 민수)')
  })
})

describe('digestFileName', () => {
  it('날짜 뒤에 -스터디정리.md를 붙인다', () => {
    expect(digestFileName('2026-08-05')).toBe('2026-08-05-스터디정리.md')
  })
})
