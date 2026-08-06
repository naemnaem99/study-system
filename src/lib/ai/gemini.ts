import { GoogleGenAI, Type } from '@google/genai'
import { getGeminiApiKey } from '@/lib/env'
import type { ExistingTopic, NoteForKnowledge } from '@/lib/knowledge-generation'
import { KNOWLEDGE_MODEL } from '@/lib/knowledge-generation'

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
    topics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          slug: { type: Type.STRING },
          name: { type: Type.STRING },
          parent_slug: { type: Type.STRING },
          summary: { type: Type.STRING },
        },
        required: ['slug', 'name', 'parent_slug', 'summary'],
      },
    },
    note_topics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          note_id: { type: Type.STRING },
          topic_slug: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          reason: { type: Type.STRING },
          evidence_quote: { type: Type.STRING },
        },
        required: ['note_id', 'topic_slug', 'confidence', 'reason', 'evidence_quote'],
      },
    },
    topic_relations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source_slug: { type: Type.STRING },
          target_slug: { type: Type.STRING },
          relation_type: {
            type: Type.STRING,
            enum: ['related', 'prerequisite', 'applies', 'contrasts'],
          },
          confidence: { type: Type.NUMBER },
          evidence_note_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['source_slug', 'target_slug', 'relation_type', 'confidence', 'evidence_note_ids'],
      },
    },
  },
  required: ['one_liner', 'members', 'connections', 'topics', 'note_topics', 'topic_relations'],
}

function 프롬프트(notes: NoteForKnowledge[], existingTopics: ExistingTopic[]): string {
  const 기존SlugById = new Map(existingTopics.map((topic) => [topic.id, topic.slug]))
  const 노트목록 = notes
    .map((n) => `### note_id=${n.id} | ${n.authorName} (${n.authorSlug}) | ${n.title}\n${n.bodyMd}`)
    .join('\n\n')

  const 기존주제목록 = existingTopics.length === 0
    ? '없음'
    : existingTopics
        .filter((topic) => topic.status !== 'archived')
        .slice(0, 80)
        .map((topic) => (
          `- ${topic.slug}: ${topic.name} | 상태=${topic.status} | 상위=${topic.parentId ? 기존SlugById.get(topic.parentId) ?? '없음' : '없음'} | 요약=${topic.summaryMd || '없음'}`
        ))
        .join('\n')

  return `당신은 4인 스터디의 하루 기록을 정리하고 지식 지도를 관리하는 분류 도우미입니다.
아래 작업을 한 번의 응답으로 완료하세요. 화면이 열릴 때는 AI를 다시 호출하지 않으므로 결과는 구체적이어야 합니다.

기존 주제(slug를 가능하면 재사용):
${기존주제목록}

오늘의 학습 노트:

${노트목록}

규칙:
- one_liner: 오늘 전체를 관통하는 한 줄 요약.
- members: 노트를 올린 사람마다 하나씩, profile_slug와 그 사람 노트의 핵심 요약.
- connections: 두 명 이상이 실제로 맞닿는 주제를 다뤘을 때만 적으세요.
  **억지로 연결을 만들지 마세요.** 겹치는 지점이 없으면 반드시 빈 배열을 반환하세요.
  "본질적으로 같은 사고방식" 같은 모호한 연결은 금지합니다.
- topics: 오늘 노트를 설명하는 2~8개의 구체적인 학습 주제. 기존 주제와 같으면 기존 slug를 그대로 재사용하세요.
  새 slug는 짧은 영문 또는 한글 kebab-case로 작성하고, 너무 넓은 "공부", "개발" 같은 이름은 금지합니다.
  parent_slug는 상위 주제가 확실할 때만 쓰고, 없으면 빈 문자열입니다.
- note_topics: 기록과 주제 연결 하나당 항목 하나를 만드세요. 모든 note_id에 가장 관련 높은 주제를 1~3개 연결하세요.
  confidence는 0~1이며 확신을 과장하지 마세요. reason은 분류 설명입니다.
  evidence_quote는 해당 note_id의 본문에서 글자와 순서를 바꾸지 않고 그대로 복사한 연속된 원문이어야 합니다.
  evidence_quote는 공백을 제외하고 최소 12자 이상이어야 하며 다른 기록의 문장을 사용하면 안 됩니다.
- topic_relations: 실제 내용 근거가 있는 주제 관계만 작성하세요. 관계가 없으면 빈 배열입니다.
  related=관련, prerequisite=선행 지식, applies=응용, contrasts=대조입니다.
  evidence_note_ids에는 이 관계를 실제로 뒷받침하는 입력 note_id만 넣으세요.
- 응답에 입력에 없는 note_id, profile_slug, 기존/새 topics에 없는 slug를 만들지 마세요.`
}

/**
 * Gemini 호출. 실제 네트워크 호출이라 단위 테스트 대상이 아니다 —
 * 재시도·검증·조립 로직은 lib/digest-generation.ts에서 목으로 테스트한다.
 */
export async function callGemini(
  notes: NoteForKnowledge[],
  existingTopics: ExistingTopic[],
): Promise<unknown> {
  const client = new GoogleGenAI({ apiKey: getGeminiApiKey() })

  const response = await client.models.generateContent({
    model: KNOWLEDGE_MODEL,
    contents: 프롬프트(notes, existingTopics),
    config: {
      responseMimeType: 'application/json',
      responseSchema: 응답스키마,
      temperature: 0.2,
    },
  })

  return JSON.parse(response.text ?? '{}')
}
