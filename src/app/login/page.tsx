'use client'

import { useActionState } from 'react'
import { login, type LoginState } from './actions'

const 초기상태: LoginState = { error: null }

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, 초기상태)

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="mb-8 text-2xl font-bold">팀 스터디</h1>

      <form action={formAction} className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="이메일"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="비밀번호"
          required
          className="rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          {pending ? '로그인 중…' : '로그인'}
        </button>
      </form>

      {state.error && <p className="mt-4 text-sm text-red-600">{state.error}</p>}
    </main>
  )
}
