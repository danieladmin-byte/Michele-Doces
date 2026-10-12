import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { Dialog } from './Dialog'
import { ProductThumb } from './ProductThumb'
import { friendlyError } from './errors'
import { moneyAuto, num } from './format'
import { marginTone, pct } from './pricing'
import { useKitData } from './kitData'

export function Kits() {
  const { company } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const d = useKitData()
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const q = query.trim().toLowerCase()
  const visible = useMemo(
    () => d.kits.filter((k) => (showInactive || k.active) && k.name.toLowerCase().includes(q)),
    [d.kits, showInactive, q],
  )

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!company || !name.trim()) return
    setBusy(true)
    const { data, error } = await supabase.from('kits').insert({ company_id: company.id, name: name.trim() }).select('id').single()
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    setCreating(false)
    setName('')
    navigate(`/kits/${(data as { id: string }).id}`)
  }

  return (
    <>
      <header className="page-head with-action">
        <div>
          <h1>Kits</h1>
          <p className="sub">Monte kits com os produtos que já estão prontos, some a embalagem e defina o preço vendo a margem.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          Novo kit
        </button>
      </header>

      <div className="toolbar">
        <input type="search" placeholder="Buscar kit" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar kit" />
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {d.loading ? (
        <p className="muted">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="muted">{d.kits.length === 0 ? 'Nenhum kit ainda. Crie o primeiro, por exemplo “Kit 4 brigadeiros”.' : 'Nenhum kit encontrado.'}</p>
      ) : (
        <div className="cards">
          {visible.map((k) => {
            const cost = d.costOf(k.id)
            const parts = d.items.filter((i) => i.kit_id === k.id)
            const prices = d.prices.filter((p) => p.kit_id === k.id)
            return (
              <article key={k.id} className={`card ${k.active ? '' : 'row-off'}`}>
                <header className="card-head">
                  <div className="card-id">
                    <ProductThumb name={k.name} path={k.image_path} />
                    <button className="row-link card-title" onClick={() => navigate(`/kits/${k.id}`)}>
                      {k.name}
                    </button>
                  </div>
                  {!k.active && <span className="chip">inativo</span>}
                </header>
                {parts.length === 0 ? (
                  <p className="muted small">Sem produtos. Abra o kit para adicionar.</p>
                ) : (
                  <ul className="kit-parts">
                    {parts.map((i) => {
                      const f = d.formatById.get(i.format_id)
                      return (
                        <li key={i.id}>
                          {num(i.quantity)}× {f?.product_name ?? '—'}
                          {f && (d.formats.filter((x) => x.product_id === f.product_id).length > 1) ? ` (${f.format_name})` : ''}
                        </li>
                      )
                    })}
                  </ul>
                )}
                <div className="cf-head">
                  <strong>Custo do kit</strong>
                  <span className="cf-cost">{moneyAuto(cost.total)}</span>
                </div>
                {prices.length === 0 ? (
                  <p className="muted small">Sem preço definido.</p>
                ) : (
                  <div className="cf-prices">
                    {prices.map((p) => {
                      const margin = p.price > 0 ? (p.price - cost.total) / p.price : null
                      return (
                        <span key={p.id} className={`pill tone-${marginTone(margin)}`}>
                          <span>{p.name}</span>
                          <b>{moneyAuto(p.price)}</b>
                          <i>{pct(margin)}</i>
                        </span>
                      )
                    })}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Novo kit">
        <form className="form" onSubmit={create}>
          <div className="field">
            <label htmlFor="kit-new">Nome do kit</label>
            <input id="kit-new" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Ex.: Kit 4 brigadeiros" />
          </div>
          <p className="hint">Depois você escolhe os produtos, a quantidade de cada um, a embalagem e o preço.</p>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={busy || !name.trim()}>
              {busy ? 'Criando…' : 'Criar kit'}
            </button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
