import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'
import { Dialog } from '../components/Dialog'
import { friendlyError } from '../lib/errors'
import { moneyAuto } from '../lib/format'
import type { RecipeCost } from '../types'

export function Recipes() {
  const { company } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState<RecipeCost[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!company) return
    const { data, error } = await supabase
      .from('recipe_cost_summary')
      .select('*')
      .eq('company_id', company.id)
      .order('name')
    if (error) toast(friendlyError(error), 'error')
    setRows((data ?? []) as RecipeCost[])
    setLoading(false)
  }, [company, toast])

  useEffect(() => {
    void load()
  }, [load])

  const visible = rows.filter(
    (r) => (showInactive || r.active) && r.name.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <>
      <header className="page-head with-action">
        <div>
          <h1>Receitas</h1>
          <p className="sub">O custo de cada tanda, separado em produto, embalagem e mão de obra.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          Nova receita
        </button>
      </header>

      <div className="toolbar">
        <input type="search" placeholder="Buscar receita" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar receita" />
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inativas
        </label>
      </div>

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : visible.length === 0 ? (
        <p className="muted">
          {rows.length === 0
            ? 'Nenhuma receita ainda. Crie a primeira: o custo é calculado a partir dos ingredientes.'
            : 'Nenhuma receita encontrada.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Receita</th>
                <th className="num">Produto</th>
                <th className="num">Embalagem</th>
                <th className="num">Mão de obra</th>
                <th className="num">Custo da tanda</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.recipe_id} className={r.active ? '' : 'row-off'} onClick={() => navigate(`/receitas/${r.recipe_id}`)}>
                  <td data-label="Receita">
                    <button className="row-link" onClick={() => navigate(`/receitas/${r.recipe_id}`)}>
                      {r.name}
                    </button>
                    {!r.active && <small className="tag"> inativa</small>}
                  </td>
                  <td data-label="Produto" className="num">{moneyAuto(r.cost_product)}</td>
                  <td data-label="Embalagem" className="num">{moneyAuto(r.cost_packaging)}</td>
                  <td data-label="Mão de obra" className="num">{moneyAuto(r.cost_labor)}</td>
                  <td data-label="Custo da tanda" className="num strong">{moneyAuto(r.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewRecipeDialog
        key={creating ? 'open' : 'closed'}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => navigate(`/receitas/${id}`)}
      />
    </>
  )
}

function NewRecipeDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { company } = useAuth()
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!company) return
    setBusy(true)
    const { data, error } = await supabase
      .from('recipes')
      .insert({ company_id: company.id, name: name.trim() })
      .select('id')
      .single()
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    onCreated(data.id as string)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Nova receita">
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="rn-name">Nome da receita</label>
          <input id="rn-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Ex.: Brigadeiro tradicional" />
          <small className="hint">Depois você adiciona ingredientes, embalagem e mão de obra.</small>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy ? 'Criando…' : 'Criar receita'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
