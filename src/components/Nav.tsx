import Link from 'next/link'
import { logout } from '@/app/login/actions'
import type { Profile } from '@/lib/auth'

export function Nav({ profiles, current }: { profiles: Profile[]; current: Profile }) {
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3 text-sm">
        <Link href="/" className="font-bold">홈</Link>

        <span className="text-gray-300">|</span>

        {profiles.map((p) => (
          <Link
            key={p.id}
            href={`/members/${p.slug}`}
            className={p.id === current.id ? 'font-semibold underline' : ''}
          >
            {p.display_name}
          </Link>
        ))}

        <span className="text-gray-300">|</span>

        <Link href="/digests">정리본</Link>

        <form action={logout} className="ml-auto">
          <button type="submit" className="text-gray-500 hover:text-black">
            로그아웃
          </button>
        </form>
      </nav>
    </header>
  )
}
