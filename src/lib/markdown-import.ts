export type ParsedMarkdown = { title: string; bodyMd: string }

const 제목줄패턴 = /^#[ \t]+(.+?)[ \t]*$/

/** 'note.md' → 'note'. 확장자가 없으면 그대로 돌려준다. */
function 확장자뗀이름(fileName: string): string {
  const i = fileName.lastIndexOf('.')
  if (i <= 0) return fileName
  return fileName.slice(0, i)
}

/**
 * 마크다운 파일에서 제목과 본문을 뽑는다.
 * 맨 앞 빈 줄들을 건너뛴 첫 줄이 '# 제목' 형태(ATX H1)면 그 줄을 제목으로
 * 쓰고 본문에서 뗀다. 아니라면 파일명(확장자 제외)을 제목으로 쓰고
 * 본문은 원본 그대로(양끝 공백만 정리) 둔다.
 */
export function parseMarkdownFile(fileName: string, content: string): ParsedMarkdown {
  const 줄들 = content.split('\n')
  let i = 0
  while (i < 줄들.length && 줄들[i].trim().length === 0) i++

  const 첫줄 = 줄들[i]
  const match = 첫줄 !== undefined ? 첫줄.match(제목줄패턴) : null

  if (!match) {
    return { title: 확장자뗀이름(fileName), bodyMd: content.trim() }
  }

  const 나머지 = 줄들.slice(i + 1)
  while (나머지.length > 0 && 나머지[0].trim().length === 0) 나머지.shift()

  return { title: match[1], bodyMd: 나머지.join('\n').trim() }
}
