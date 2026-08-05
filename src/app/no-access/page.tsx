import { logout } from '@/app/login/actions'

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-3 text-xl font-bold">접근 권한이 없습니다</h1>
      <p className="mb-6 text-sm text-gray-600">
        로그인은 되었지만 이 스터디의 팀원으로 등록되어 있지 않습니다.
        관리자에게 문의하세요.
      </p>
      <form action={logout}>
        <button type="submit" className="rounded border px-3 py-2 text-sm">
          로그아웃
        </button>
      </form>
    </main>
  )
}
