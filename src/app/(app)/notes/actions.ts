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

export async function updateNote(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const profile = await requireProfile()
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: '잘못된 요청입니다' }

  const parsed = parseNoteInput({
    title: formData.get('title'),
    bodyMd: formData.get('bodyMd'),
    studiedOn: formData.get('studiedOn'),
  })
  if (!parsed.ok) return { error: parsed.message }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('notes')
    .update({
      title: parsed.value.title,
      body_md: parsed.value.bodyMd,
      studied_on: parsed.value.studiedOn,
    })
    .eq('id', id)
    .select('id')

  if (error) return { error: '저장하지 못했습니다. 잠시 후 다시 시도하세요.' }

  // RLS가 막으면 에러가 아니라 '수정된 행 0개'로 돌아온다. 여기서 잡아야 한다.
  if (!data || data.length === 0) {
    return { error: '이 노트를 수정할 권한이 없습니다' }
  }

  revalidatePath('/')
  revalidatePath(`/members/${profile.slug}`)
  revalidatePath(`/notes/${id}`)
  redirect(`/notes/${id}`)
}

export async function deleteNote(formData: FormData): Promise<void> {
  const profile = await requireProfile()
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/')

  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.from('notes').delete().eq('id', id).select('id')

  // 수정과 마찬가지로, RLS는 에러 대신 '삭제된 행 0개'로 막는다.
  // 결과를 버리고 리다이렉트하면 실패를 성공처럼 보여주게 된다.
  if (!data || data.length === 0) {
    redirect(`/notes/${id}`)
  }

  revalidatePath('/')
  revalidatePath(`/members/${profile.slug}`)
  redirect(`/members/${profile.slug}`)
}
