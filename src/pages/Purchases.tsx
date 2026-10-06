import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'
import { friendlyError } from '../lib/errors'
import { UNIT_LABEL, brl, formatDate, num } from '../lib/format'
import type { Purchase, PurchaseItem, Supplier } from '../types'

export function Purchases() {
  const { company } = useAuth()
  const toast = useToast()
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [suppliers, setSuppliers] = useState<Map<string, string>>(new Map())
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
  const [itemsByPurchase, setItemsByPurchase] = useState<Record<string, PurchaseItem[]>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!company) return
    const [p, s, i] = await Promise.all([
      supabase
        .from('purchases')
        .select('*')
        .eq('company_id', company.id)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('suppliers').select('id, name').eq('company_id', company.id),
      supabase.from('ingredients').select('id, name').eq('company_id', company.id),
    ])
    if (p.error) toast(friendlyError(p.error), 'error')
    setPurchases((p.data ?? []) as Purchase[])
    setSuppliers(new Map(((s.data ?? []) as Supplier[]).map((x) => [x.id, x.name])))
    setNames(new Map(((i.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])))
    setLoading(false)
  }, [company, toast])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(id: string) {
    if (open === id) {
      setOpen(null)
      return
    }
    setOpen(id)
    if (!itemsByPurchase[id]) {
      const { data, error } = await supabase.from('purchase_items').select('*').eq('purchase_id', id)
      if (error) {
        toast(friendlyError(error), 'error')
        return
      }
      setItemsByPurchase((m) => ({ ...m, [id]: (data ?? []) as PurchaseItem[] }))
    }
  }

  return (
    <>
      <header className="page-head with-action">
        <div>
          <h1>Compras</h1>
          <p className="sub">Cada compra aumenta o estoque e atualiza o custo médio dos ingredientes.</p>
        </div>
        <Link to="/compras/nova" className="btn btn-primary">
          Nova compra
        </Link>
      </header>

      {loading ? (
        <p className="muted">Carregando…</p>
      ) : purchases.length === 0 ? (
        <p className="muted">Nenhuma compra registrada ainda.</p>
      ) : (
        <ul className="ledger">
          {purchases.map((p) => (
            <li key={p.id} className={open === p.id ? 'is-open' : ''}>
              <button className="ledger-row" onClick={() => void toggle(p.id)} aria-expanded={open === p.id}>
                <span className="ledger-date">{formatDate(p.purchase_date)}</span>
                <span className="ledger-main">
                  <strong>{(p.supplier_id && suppliers.get(p.supplier_id)) || 'Sem fornecedor'}</strong>
                  {p.invoice_number && <small>NF {p.invoice_number}</small>}
                </span>
                <span className="ledger-total">{brl(p.total)}</span>
              </button>
              {open === p.id && (
                <div className="ledger-detail">
                  {(itemsByPurchase[p.id] ?? []).map((it) => (
                    <div key={it.id} className="ledger-line">
                      <span>{names.get(it.ingredient_id) ?? 'Ingrediente removido'}</span>
                      <span>
                        {num(it.quantity)} {UNIT_LABEL[it.unit]}
                      </span>
                      <span>{brl(it.total_price)}</span>
                    </div>
                  ))}
                  {!itemsByPurchase[p.id] && <p className="muted">Carregando itens…</p>}
                  {p.notes && <p className="muted">{p.notes}</p>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
