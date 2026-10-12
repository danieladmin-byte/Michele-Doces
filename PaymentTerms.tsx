import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { useToast } from './Toast'
import { friendlyError } from './errors'
import { DEFAULT_TERMS } from './docs'
import type { PaymentMethod } from './types'

const CUSTOM = '__custom__'

/** Carrega as formas de pagamento cadastradas e devolve o texto padrão (primeira marcada como padrão). */
export function usePaymentMethods() {
  const { company } = useAuth()
  const toast = useToast()
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    if (!company) return
    const { data, error } = await supabase
      .from('payment_methods')
      .select('id, name, terms, is_default')
      .eq('company_id', company.id)
      .order('created_at')
    if (error) toast(friendlyError(error), 'error')
    setMethods((data ?? []) as PaymentMethod[])
    setLoaded(true)
  }, [company, toast])

  useEffect(() => {
    void reload()
  }, [reload])

  const defaultText = (methods.find((m) => m.is_default) ?? methods[0])?.terms ?? company?.quote_terms?.trim() ?? DEFAULT_TERMS.join('\n')
  return { methods, loaded, reload, defaultText }
}

/**
 * Forma de pagamento do orçamento: escolhe uma das cadastradas, edita o texto (uma condição por linha)
 * e, se quiser, guarda a combinação como uma nova forma de pagamento.
 */
export function PaymentTermsField({
  value,
  onChange,
  methods,
  reload,
}: {
  value: string
  onChange: (v: string) => void
  methods: PaymentMethod[]
  reload: () => Promise<void>
}) {
  const { company } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const norm = (t: string) =>
    t
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n')
  const matched = methods.find((m) => norm(m.terms) === norm(value))
  const selectValue = matched?.id ?? CUSTOM

  async function saveNew() {
    if (!company) return
    const terms = norm(value)
    if (!terms) return toast('Escreva as condições de pagamento primeiro.', 'error')
    const name = window.prompt('Nome desta forma de pagamento (ex.: 30% na reserva + 70% na entrega):')?.trim()
    if (!name) return
    setBusy(true)
    const { error } = await supabase.from('payment_methods').insert({ company_id: company.id, name, terms })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Forma de pagamento salva')
    await reload()
  }

  async function removeSelected() {
    if (!matched) return
    if (!window.confirm(`Excluir a forma de pagamento “${matched.name}”? Orçamentos já feitos não mudam.`)) return
    setBusy(true)
    const { error } = await supabase.from('payment_methods').delete().eq('id', matched.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    await reload()
  }

  return (
    <div className="pay-field">
      <div className="field">
        <label htmlFor="pay-sel">Forma de pagamento</label>
        <select
          id="pay-sel"
          value={selectValue}
          onChange={(e) => {
            const m = methods.find((x) => x.id === e.target.value)
            if (m) onChange(m.terms)
          }}
        >
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value={CUSTOM}>Personalizada (editada abaixo)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="pay-terms">Condições que aparecem no PDF (uma por linha)</label>
        <textarea id="pay-terms" rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={'50% Antecipado\n50% na Entrega'} />
      </div>
      <div className="block-add">
        {!matched && (
          <button type="button" className="btn btn-small" disabled={busy} onClick={() => void saveNew()}>
            Salvar como nova forma de pagamento
          </button>
        )}
        {matched && (
          <button type="button" className="link-btn" disabled={busy} onClick={() => void removeSelected()}>
            Excluir “{matched.name}”
          </button>
        )}
      </div>
    </div>
  )
}
