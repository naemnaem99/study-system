import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * 노트 본문 렌더러.
 *
 * rehype-raw 를 쓰지 않는다. react-markdown 은 기본적으로 원시 HTML을
 * 렌더링하지 않으므로, 팀원이 본문에 <script> 를 적어도 그냥 글자로 나온다.
 * 이 기본값을 끄지 말 것.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
