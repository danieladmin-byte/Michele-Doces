import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { Dialog } from './Dialog'
import { friendlyError } from './errors'
import { ALL, NONE } from './catalogData'
import type { CatalogPhoto, CatalogTheme } from './types'

const SUGGESTIONS = ['Disney', 'Flores', 'Marvel', 'Chá de Bebê', 'Princesas', 'Páscoa', 'Natal']

/** Filtro por tema (lista suspensa). Mostra quantas fotos tem cada tema. */
export function ThemeSelect({
  themes,
  photos,
  value,
  onChange,
  id,
}: {
  themes: CatalogTheme[]
  photos: CatalogPhoto[]
  value: string
  onChange: (v: string) => void
  id?: string
}) {
  const count = (tid: string | null) => photos.filter((p) => p.theme_id === tid).length
  if (themes.length === 0) return null
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Filtrar por tema">
      <option value={ALL}>Todos os temas</option>
      {themes.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} ({count(t.id)})
        </option>
      ))}
      {count(null) > 0 && <option value={NONE}>Sem tema ({count(null)})</option>}
    </select>
  )
}

/** Criar, renomear e excluir temas (Disney, Flores, Marvel, Chá de Bebê…). */
export function ThemesDialog({
  open,
  onClose,
  themes,
  photos,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  themes: CatalogTheme[]
  photos: CatalogPhoto[]
  onChanged: () => void | Promise<void>
}) {
  const { company } = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function add(n: string) {
    const clean = n.trim()
    if (!company || !clean) return
    if (themes.some((t) => t.name.toLowerCase() === clean.toLowerCase())) return toast('Esse tema já existe.', 'error')
    setBusy(true)
    const { error } = await supabase.from('catalog_themes').insert({ company_id: company.id, name: clean })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    setName('')
    await onChanged()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    await add(name)
  }

  async function rename(t: CatalogTheme, next: string) {
    const clean = next.trim()
    if (!clean || clean === t.name) return
    if (themes.some((x) => x.id !== t.id && x.name.toLowerCase() === clean.toLowerCase())) return toast('Esse tema já existe.', 'error')
    const { error } = await supabase.from('catalog_themes').update({ name: clean }).eq('id', t.id)
    if (error) return toast(friendlyError(error), 'error')
    await onChanged()
  }

  async function remove(t: CatalogTheme) {
    const n = photos.filter((p) => p.theme_id === t.id).length
    const msg = n > 0 ? `Excluir o tema “${t.name}”? As ${n} fotos continuam no catálogo, só ficam sem tema.` : `Excluir o tema “${t.name}”?`
    if (!window.confirm(msg)) return
    const { error } = await supabase.from('catalog_themes').delete().eq('id', t.id)
    if (error) return toast(friendlyError(error), 'error')
    await onChanged()
  }

  const photoCount = (tid: string) => {
    const n = photos.filter((p) => p.theme_id === tid).length
    return `${n} ${n === 1 ? 'foto' : 'fotos'}`
  }

  const missing = SUGGESTIONS.filter((s) => !themes.some((t) => t.name.toLowerCase() === s.toLowerCase()))

  return (
    <Dialog open={open} onClose={onClose} title="Temas do catálogo">
      <form className="theme-add" onSubmit={submit}>
        <div className="field">
          <label htmlFor="theme-new">Novo tema</label>
          <input id="theme-new" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Disney" maxLength={40} />
        </div>
        <button className="btn btn-primary" disabled={busy || !name.trim()}>
          Adicionar
        </button>
      </form>

      {missing.length > 0 && (
        <div className="theme-suggest">
          <small className="hint">Sugestões:</small>
          {missing.map((s) => (
            <button key={s} type="button" className="tab" disabled={busy} onClick={() => void add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}

      {themes.length === 0 ? (
        <p className="muted">Nenhum tema ainda. Crie um para poder filtrar as fotos por ele.</p>
      ) : (
        <ul className="theme-list">
          {themes.map((t) => (
            <li key={t.id}>
              <input
                key={t.name}
                defaultValue={t.name}
                maxLength={40}
                aria-label={`Nome do tema ${t.name}`}
                onBlur={(e) => void rename(t, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
              <small className="muted theme-count">{photoCount(t.id)}</small>
              <button type="button" className="link-btn" onClick={() => void remove(t)}>
                Excluir
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Pronto
        </button>
      </div>
    </Dialog>
  )
}
