import { describe, it, expect } from 'vitest'
import { parseMarkdownFile } from '@/lib/markdown-import'

describe('parseMarkdownFile', () => {
  it('첫 줄이 # 제목이면 제목으로 쓰고 본문에서 뗀다', () => {
    const r = parseMarkdownFile('아무개.md', '# 오늘 배운 것\n\n내용입니다.')
    expect(r.title).toBe('오늘 배운 것')
    expect(r.bodyMd).toBe('내용입니다.')
  })

  it('제목 줄 앞뒤 공백을 정리한다', () => {
    const r = parseMarkdownFile('a.md', '#   공백 제목   \n본문')
    expect(r.title).toBe('공백 제목')
  })

  it('제목 줄 앞의 빈 줄을 건너뛴다', () => {
    const r = parseMarkdownFile('a.md', '\n\n# 제목\n본문')
    expect(r.title).toBe('제목')
    expect(r.bodyMd).toBe('본문')
  })

  it('#이 여러 개(##)면 제목 줄로 보지 않는다', () => {
    const r = parseMarkdownFile('소제목.md', '## 소제목\n본문')
    expect(r.title).toBe('소제목')
    expect(r.bodyMd).toBe('## 소제목\n본문')
  })

  it('# 뒤에 공백이 없으면 제목 줄로 보지 않는다', () => {
    const r = parseMarkdownFile('해시태그.md', '#해시태그\n본문')
    expect(r.title).toBe('해시태그')
    expect(r.bodyMd).toBe('#해시태그\n본문')
  })

  it('첫 줄에 제목이 없으면 파일명(확장자 제외)을 제목으로 쓴다', () => {
    const r = parseMarkdownFile('2026-08-05-회고.md', '오늘은 힘들었다.')
    expect(r.title).toBe('2026-08-05-회고')
    expect(r.bodyMd).toBe('오늘은 힘들었다.')
  })

  it('파일명에 점이 여러 개면 마지막 것만 확장자로 뗀다', () => {
    const r = parseMarkdownFile('노트.초안.md', '본문')
    expect(r.title).toBe('노트.초안')
  })

  it('확장자가 없는 파일명은 그대로 제목이 된다', () => {
    const r = parseMarkdownFile('README', '본문')
    expect(r.title).toBe('README')
  })

  it('제목 줄 다음의 빈 줄들을 본문 앞에서 정리한다', () => {
    const r = parseMarkdownFile('a.md', '# 제목\n\n\n본문 시작')
    expect(r.bodyMd).toBe('본문 시작')
  })

  it('제목만 있고 본문이 없으면 빈 문자열을 돌려준다', () => {
    const r = parseMarkdownFile('a.md', '# 제목만 있음')
    expect(r.bodyMd).toBe('')
  })
})
