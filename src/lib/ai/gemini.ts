import { GoogleGenAI, Type } from '@google/genai'
import { getGeminiApiKey } from '@/lib/env'
import type { NoteForDigest } from '@/lib/digest-generation'

const 모델 = 'gemini-3.5-flash'

const 응답스키마 = {
  type: Type.OBJECT,
  properties: {
    one_liner: { type: Type.STRING },
    members: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          profile_slug: { type: Type.STRING },
          summary: { type: Type.STRING },
        },
        required: ['profile_slug', 'summary'],
      },
    },
    connections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
          member_slugs: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['title', 'detail', 'member_slugs'],
      },
    },
  },
  required: ['one_liner', 'members', 'connections'],
}

function 프롬프트(notes: NoteForDigest[]): string {
  const 노트목록 = notes
    .map((n) => `### ${n.authorName} (${n.authorSlug}) — ${n.title}\n${n.bodyMd}`)
    .join('\n\n')

  return `당신은 스터디 그룹의 하루 학습 내용을 정리하는 도우미입니다.
아래는 오늘 팀원들이 올린 학습 노트입니다.

${노트목록}

규칙:
- one_liner: 오늘 전체를 관통하는 한 줄 요약.
- members: 노트를 올린 사람마다 하나씩, profile_slug와 그 사람 노트의 핵심 요약.
- connections: 두 명 이상이 실제로 맞닿는 주제를 다뤘을 때만 적으세요.
  **억지로 연결을 만들지 마세요.** 겹치는 지점이 없으면 반드시 빈 배열을 반환하세요.
  "본질적으로 같은 사고방식" 같은 모호한 연결은 금지합니다.`
}

/**
 * Gemini 호출. 실제 네트워크 호출이라 단위 테스트 대상이 아니다 —
 * 재시도·검증·조립 로직은 lib/digest-generation.ts에서 목으로 테스트한다.
 */
export async function callGemini(notes: NoteForDigest[]): Promise<unknown> {
  const client = new GoogleGenAI({ apiKey: getGeminiApiKey() })

  const response = await client.models.generateContent({
    model: 모델,
    contents: 프롬프트(notes),
    config: {
      responseMimeType: 'application/json',
      responseSchema: 응답스키마,
    },
  })

  return JSON.parse(response.text ?? '{}')
}
