import { requireProfile, getAllProfiles } from '@/lib/auth'
import { Nav } from '@/components/Nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()
  const profiles = await getAllProfiles()

  return (
    <>
      <Nav profiles={profiles} current={profile} />
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </>
  )
}
