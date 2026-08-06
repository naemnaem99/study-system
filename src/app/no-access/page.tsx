import { logout } from '@/app/login/actions'

export default function NoAccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-mist text-xl text-study">✦</span>
      <p className="mt-7 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-study">Private grove</p>
      <h1 className="font-display mt-3 text-3xl font-bold text-ink">접근 권한이 없습니다</h1>
      <p className="mx-auto mb-7 mt-4 max-w-md text-sm leading-7 text-ink/52">
        로그인은 되었지만 이 스터디의 팀원으로 등록되어 있지 않습니다.
        관리자에게 문의하세요.
      </p>
      <form action={logout}>
        <button type="submit" className="min-h-11 rounded-xl border border-hairline bg-white px-5 text-sm font-bold text-ink transition-all hover:-translate-y-0.5 hover:border-study/35 hover:text-study">
          로그아웃
        </button>
      </form>
    </main>
  )
}
