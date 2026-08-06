'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { logout } from '@/app/login/actions'
import type { Profile } from '@/lib/auth'

type IconName = 'home' | 'archive' | 'digest' | 'graph' | 'write' | 'menu' | 'close' | 'chevron'

function Icon({ name, className = 'size-4' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 10.8 12 3l9 7.8"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></>,
    archive: <><path d="M4 7h16v14H4z"/><path d="M3 3h18v4H3zM9 11h6"/></>,
    digest: <><path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    graph: <><circle cx="12" cy="5" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="m10.9 6.7-4.8 9.6m7-9.6 4.8 9.6M7 18h10"/></>,
    write: <><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
    close: <path d="m6 6 12 12M18 6 6 18"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {paths[name]}
    </svg>
  )
}

export function Nav({ profiles, current }: { profiles: Profile[]; current: Profile }) {
  const pathname = usePathname()
  const [저장소펼침, set저장소펼침] = useState(true)
  const [모바일열림, set모바일열림] = useState(false)

  const 활성 = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)
  const 저장소활성 = pathname.startsWith('/members')

  const 항목클래스 = (selected: boolean) =>
    `group flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-[13px] font-semibold transition-all duration-200 ${
      selected
        ? 'bg-mist text-study shadow-[inset_3px_0_0_#2f7d5a]'
        : 'text-ink/62 hover:translate-x-0.5 hover:bg-mist/70 hover:text-ink'
    }`

  const 메뉴내용 = (
    <>
      <div className="flex h-[76px] items-center border-b border-hairline px-5">
        <Link href="/" onClick={() => set모바일열림(false)} className="group flex items-center gap-2.5 font-bold tracking-[-0.02em] text-ink">
          <span className="relative grid size-9 place-items-center rounded-full bg-study text-white shadow-[0_8px_22px_rgba(47,125,90,0.2)] transition-transform duration-300 group-hover:rotate-6">
            <span className="size-2.5 rounded-full border-2 border-white" />
            <span className="absolute -right-0.5 top-0 size-2.5 rounded-full bg-leaf ring-2 ring-paper" />
          </span>
          <span>
            <span className="block text-[15px]">Study Grove</span>
            <span className="mt-0.5 block font-mono text-[8px] font-medium uppercase tracking-[0.12em] text-ink/35">Team knowledge</span>
          </span>
        </Link>
        <button type="button" onClick={() => set모바일열림(false)} className="ml-auto rounded-md p-2 text-ink/60 hover:bg-mist md:hidden" aria-label="메뉴 닫기">
          <Icon name="close" className="size-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-3.5 py-5">
        <Link href="/notes/new" onClick={() => set모바일열림(false)} className="mb-6 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-study px-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(47,125,90,0.16)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-ink hover:shadow-[0_14px_30px_rgba(25,53,42,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-study focus-visible:ring-offset-2">
          <Icon name="write" />
          새 스터디 기록
        </Link>

        <nav aria-label="주요 메뉴" className="space-y-1">
          <Link href="/" onClick={() => set모바일열림(false)} className={항목클래스(활성('/'))}>
            <Icon name="home" />
            홈
          </Link>

          <button type="button" onClick={() => set저장소펼침((value) => !value)} aria-expanded={저장소펼침} className={`${항목클래스(저장소활성)} w-full`}>
            <Icon name="archive" />
            저장소
            <Icon name="chevron" className={`ml-auto size-4 transition-transform ${저장소펼침 ? 'rotate-90' : ''}`} />
          </button>

          {저장소펼침 && (
            <div className="ml-[19px] border-l border-hairline pb-3 pl-3.5 pt-1.5">
              {profiles.map((profile) => (
                <Link
                  key={profile.id}
                  href={`/members/${profile.slug}`}
                  onClick={() => set모바일열림(false)}
                  className={`group/member flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-all duration-200 ${
                    pathname === `/members/${profile.slug}`
                      ? 'bg-mist font-semibold text-study'
                      : 'text-ink/58 hover:translate-x-0.5 hover:bg-mist/70 hover:text-ink'
                  }`}
                >
                  <span className={`grid size-6 place-items-center rounded-full text-[10px] font-bold transition-colors ${pathname === `/members/${profile.slug}` ? 'bg-study text-white' : 'bg-hairline/65 text-ink/50 group-hover/member:bg-leaf group-hover/member:text-ink'}`}>
                    {profile.display_name.slice(0, 1)}
                  </span>
                  {profile.display_name}
                  {profile.id === current.id && <span className="ml-auto font-mono text-[10px] text-study/70">나</span>}
                </Link>
              ))}
            </div>
          )}

          <Link href="/digests" onClick={() => set모바일열림(false)} className={항목클래스(활성('/digests'))}>
            <Icon name="digest" />
            정리본
          </Link>

          <Link href="/mindmap" onClick={() => set모바일열림(false)} className={항목클래스(활성('/mindmap'))}>
            <Icon name="graph" />
            스터디 마인드맵
            <span className="ml-auto rounded-full bg-mist px-2 py-0.5 font-mono text-[9px] font-medium text-study">설계 중</span>
          </Link>
        </nav>

        <div className="mt-auto border-t border-hairline pt-5">
          <div className="mb-3 flex items-center gap-3 px-2">
            <span className="growth-ring relative grid size-9 place-items-center rounded-full bg-mist text-xs font-bold text-study">
              {current.display_name.slice(0, 1)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{current.display_name}</p>
              <p className="font-mono text-[10px] text-ink/45">study member</p>
            </div>
          </div>
          <form action={logout}>
            <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-xs text-ink/55 transition-colors hover:bg-mist hover:text-ink">
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </>
  )

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center border-b border-hairline bg-paper/90 px-4 backdrop-blur-xl md:hidden">
        <button type="button" onClick={() => set모바일열림(true)} className="rounded-md p-2 text-ink hover:bg-mist" aria-label="메뉴 열기" aria-expanded={모바일열림}>
          <Icon name="menu" className="size-5" />
        </button>
        <span className="ml-3 text-sm font-bold text-ink">Study Grove</span>
      </header>

      {모바일열림 && <button type="button" aria-label="메뉴 닫기" onClick={() => set모바일열림(false)} className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-[1px] md:hidden" />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-hairline bg-paper transition-transform duration-300 md:translate-x-0 ${모바일열림 ? 'translate-x-0' : '-translate-x-full'}`}>
        {메뉴내용}
      </aside>
    </>
  )
}
