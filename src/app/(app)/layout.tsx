import { requireProfile, getAllProfiles } from '@/lib/auth'
import { Nav } from '@/components/Nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()
  const profiles = await getAllProfiles()

  return (
    <div className="min-h-screen bg-paper">
      <Nav profiles={profiles} current={profile} />
      <div className="min-w-0 md:pl-72">
        <main className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-8 sm:px-9 sm:pt-10 lg:px-14 lg:pb-24 lg:pt-14">{children}</main>
      </div>
    </div>
  )
}
