'use client'

import { useActionState } from 'react'
import { login, type LoginState } from './actions'
import { StorysetTeam } from '@/components/StorysetTeam'

const 초기상태: LoginState = { error: null }

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, 초기상태)

  return (
    <main className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden border-r border-hairline bg-mist/55 px-12 lg:grid lg:place-items-center">
        <div className="absolute -left-24 -top-24 size-72 rounded-full border border-leaf/25" />
        <div className="absolute -left-10 -top-10 size-44 rounded-full border border-leaf/25" />
        <div className="page-enter relative z-10 max-w-lg text-center">
          <StorysetTeam priority className="mb-5" />
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-study">Grow what your team learns</p>
          <h2 className="font-display mt-4 text-4xl font-bold leading-[1.3] text-ink">각자의 배움이<br />팀의 지식으로 자랍니다.</h2>
          <p className="mx-auto mt-5 max-w-md text-sm leading-7 text-ink/52">기록하고, 함께 읽고, 연결된 지식을 오래 남기는 네 사람의 스터디 공간입니다.</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="page-enter w-full max-w-[420px]">
          <div className="mb-10 flex items-center gap-3">
            <span className="relative grid size-11 place-items-center rounded-full bg-study text-white shadow-[0_10px_26px_rgba(47,125,90,0.18)]">
              <span className="size-3 rounded-full border-2 border-white" />
              <span className="absolute -right-0.5 top-0 size-3 rounded-full bg-leaf ring-2 ring-paper" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-[-0.03em] text-ink">Study Grove</h1>
              <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink/35">Private study space</p>
            </div>
          </div>

          <div className="mb-8">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-study">Welcome back</p>
            <h2 className="font-display mt-3 text-3xl font-bold text-ink">다시 만나 반가워요.</h2>
            <p className="mt-3 text-sm text-ink/48">내 기록과 팀의 오늘을 이어서 살펴보세요.</p>
          </div>

          <form action={formAction} className="flex flex-col gap-3">
            <label htmlFor="email" className="text-xs font-bold text-ink/62">이메일</label>
            <input id="email" name="email" type="email" placeholder="이메일" required className="min-h-12 rounded-xl border border-hairline bg-white px-4 outline-none transition-all focus:border-study focus:ring-4 focus:ring-study/10" />
            <label htmlFor="password" className="mt-2 text-xs font-bold text-ink/62">비밀번호</label>
            <input id="password" name="password" type="password" placeholder="비밀번호" required className="min-h-12 rounded-xl border border-hairline bg-white px-4 outline-none transition-all focus:border-study focus:ring-4 focus:ring-study/10" />
            <button type="submit" disabled={pending} className="mt-4 min-h-12 rounded-xl bg-study px-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(47,125,90,0.17)] transition-all hover:-translate-y-0.5 hover:bg-ink disabled:translate-y-0 disabled:opacity-50">
              {pending ? '로그인 중…' : 'Study Grove 들어가기'}
            </button>
          </form>

          {state.error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>}
        </div>
      </section>
    </main>
  )
}
