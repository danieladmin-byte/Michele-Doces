import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { Dialog } from './Dialog'
import { friendlyError } from './errors'
import type { Customer } from './types'

const EMPTY = { name: '', phone: '', email: '', document: '', address: '', city: '', state: '', zip_code: '', notes: '' }

export function Customers() {
  const { company } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Customer | 'new' | null>(null)

  const load = useCallback(async () => {
    if (!company) return
    const { data, error } = await supabase.from('customers').select('*').eq('company_id', company.id).order('name')
    if (error) toast(friendlyError(error), 'error')
    setRows((data ?? []) as Customer[])
    setLoading(false)
  }, [company, toast])

  useEffect(() => {
    void load()
  }, [load])

  const q = query.trim().toLowerCase()
  const visible = rows.filter(
    (c) => (showInactive || c.active) && (c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)),
  )

  return (
    <>
      <header className="page-head with-action">
        <div>
          <h1>Clientes</h1>
          <p className="sub">Quem compra de você. Aparece no orçamento (A/C) e no histórico de pedidos.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          Novo cliente
        </button>
      </header>

      <div className="toolbar">
        <input type="search" placeholder="Buscar por nome ou telefone" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar cliente" />
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="muted">{rows.length === 0 ? 'Nenhum cliente ainda. Cadastre o primeiro para fazer orçamentos.' : 'Nenhum cliente encontrado.'}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Cidade</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className={c.active ? '' : 'row-off'} onClick={() => setEditing(c)}>
                  <td data-label="Nome">
                    <button className="row-link" onClick={() => setEditing(c)}>
                      {c.name}
                    </button>
                    {!c.active && <small className="tag"> inativo</small>}
                  </td>
                  <td data-label="Telefone">{c.phone || '—'}</td>
                  <td data-label="E-mail">{c.email || '—'}</td>
                  <td data-label="Cidade">{c.city || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CustomerDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null)
          await load()
        }}
      />
    </>
  )
}

/** Formulário de cliente (também usado dentro do editor de orçamentos). */
export function CustomerDialog({
  target,
  onClose,
  onSaved,
}: {
  target: Customer | 'new' | null
  onClose: () => void
  onSaved: (id: string) => Promise<void> | void
}) {
  const { company } = useAuth()
  const toast = useToast()
  const existing = target && target !== 'new' ? target : null
  const [f, setF] = useState(
    existing
      ? {
          name: existing.name,
          phone: existing.phone ?? '',
          email: existing.email ?? '',
          document: existing.document ?? '',
          address: existing.address ?? '',
          city: existing.city ?? '',
          state: existing.state ?? '',
          zip_code: existing.zip_code ?? '',
          notes: existing.notes ?? '',
        }
      : EMPTY,
  )
  const [active, setActive] = useState(existing?.active ?? true)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!company) return
    const clean = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() === '' && k !== 'name' ? null : v.trim()]))
    setBusy(true)
    if (existing) {
      const { error } = await supabase.from('customers').update({ ...clean, active }).eq('id', existing.id)
      setBusy(false)
      if (error) return toast(friendlyError(error), 'error')
      toast('Cliente atualizado')
      await onSaved(existing.id)
    } else {
      const { data, error } = await supabase
        .from('customers')
        .insert({ ...clean, company_id: company.id })
        .select('id')
        .single()
      setBusy(false)
      if (error) return toast(friendlyError(error), 'error')
      toast('Cliente cadastrado')
      await onSaved(data.id as string)
    }
  }

  return (
    <Dialog open={target !== null} onClose={onClose} title={existing ? 'Editar cliente' : 'Novo cliente'}>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="cu-name">Nome</label>
          <input id="cu-name" value={f.name} onChange={set('name')} required autoFocus />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="cu-phone">Telefone / WhatsApp</label>
            <input id="cu-phone" inputMode="tel" value={f.phone} onChange={set('phone')} />
          </div>
          <div className="field">
            <label htmlFor="cu-email">E-mail</label>
            <input id="cu-email" type="email" value={f.email} onChange={set('email')} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="cu-doc">CPF / CNPJ (opcional)</label>
          <input id="cu-doc" value={f.document} onChange={set('document')} />
        </div>
        <div className="field">
          <label htmlFor="cu-addr">Endereço (opcional)</label>
          <input id="cu-addr" value={f.address} onChange={set('address')} />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="cu-city">Cidade</label>
            <input id="cu-city" value={f.city} onChange={set('city')} />
          </div>
          <div className="field">
            <label htmlFor="cu-state">Estado</label>
            <input id="cu-state" value={f.state} onChange={set('state')} maxLength={2} placeholder="SP" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="cu-notes">Anotações</label>
          <textarea id="cu-notes" rows={2} value={f.notes} onChange={set('notes')} placeholder="Preferências, alergias, como conheceu…" />
        </div>
        {existing && (
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Cliente ativo
          </label>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || !f.name.trim()}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
