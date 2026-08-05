'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireProfile } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { parseNoteInput, type NoteFormState } from '@/lib/validation'

export async function createNote(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const profile = await requireProfile()

  const parsed = parseNoteInput({
    title: formData.get('title'),
    bodyMd: formData.get('bodyMd'),
    studiedOn: formData.get('studiedOn'),
  })
  if (!parsed.ok) return { error: parsed.message }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('notes')
    .insert({
      author_id: profile.id,
      title: parsed.value.title,
      body_md: parsed.value.bodyMd,
      studied_on: parsed.value.studiedOn,
    })
    .select('id')
    .single()

  if (error || !data) {
    return { error: '저장하지 못했습니다. 잠시 후 다시 시도하세요.' }
  }

  revalidatePath('/')
  revalidatePath(`/members/${profile.slug}`)
  redirect(`/notes/${data.id}`)
}
