import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'
import { friendlyError } from '../lib/errors'

type Member = { id: string; role: string; profiles: { name: string | null; email: string | null } | null }

export function Settings() {
  const { company, canManage, reload, signOut } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState({
    name: '',
    trade_name: '',
    document: '',
    email: '',
    phone: '',
    address: '',
    payment_info: '',
    quote_terms: '',
  })
  const [members, setMembers] = useState<Member[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!company) return
    setForm({
      name: company.name ?? '',
      trade_name: company.trade_name ?? '',
      document: company.document ?? '',
      email: company.email ?? '',
      phone: company.phone ?? '',
      address: company.address ?? '',
      payment_info: company.payment_info ?? '',
      quote_terms: company.quote_terms ?? '',
    })
    ;(async () => {
      const { data: rows } = await supabase.from('company_members').select('id, role, user_id').eq('company_id', company.id)
      const ids = (rows ?? []).map((r) => r.user_id as string)
      const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', ids)
      const map = new Map((profs ?? []).map((p) => [p.id as string, p as { name: string | null; email: string | null }]))
      setMembers(
        (rows ?? []).map((r) => ({ id: r.id as string, role: r.role as string, profiles: map.get(r.user_id as string) ?? null })),
      )
    })()
  }, [company])

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!company) return
    setBusy(true)
    const clean = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v.trim() === '' && k !== 'name' ? null : v.trim()]),
    )
    const { error } = await supabase.from('companies').update(clean).eq('id', company.id)
    setBusy(false)
    if (error) return toast(friendlyError(error), 'error')
    toast('Dados salvos')
    await reload()
  }

  async function uploadLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !company) return
    if (file.size > 2 * 1024 * 1024) return toast('A imagem deve ter até 2 MB.', 'error')
    const ext = (file.name.split('.').pop() ?? 'png').toLowerCase()
    const path = `${company.id}/logo-${Date.now()}.${ext}`
    const up = await supabase.storage.from('company-logos').upload(path, file, { contentType: file.type })
    if (up.error) return toast(friendlyError(up.error), 'error')
    const { error } = await supabase.from('companies').update({ logo_path: path }).eq('id', company.id)
    if (error) return toast(friendlyError(error), 'error')
    toast('Logo atualizada')
    await reload()
  }

  const logoUrl = company?.logo_path
    ? supabase.storage.from('company-logos').getPublicUrl(company.logo_path).data.publicUrl
    : null

  return (
    <>
      <header className="page-head">
        <h1>Configurações</h1>
        <p className="sub">Esses dados aparecem nos orçamentos em PDF.</p>
      </header>

      {!canManage && <p className="msg msg-info">Somente o proprietário pode alterar os dados da empresa.</p>}

      <form className="form form-wide" onSubmit={save}>
        <div className="logo-row">
          {logoUrl ? <img src={logoUrl} alt="Logo da empresa" className="logo-preview" /> : <span className="logo-empty">Sem logo</span>}
          {canManage && (
            <label className="btn btn-small">
              Enviar logo
              <input type="file" accept="image/*" hidden onChange={uploadLogo} />
            </label>
          )}
        </div>

        <fieldset disabled={!canManage} className="fieldset-plain">
          <div className="grid-2">
            <div className="field">
              <label htmlFor="s-name">Nome</label>
              <input id="s-name" value={form.name} onChange={set('name')} required />
            </div>
            <div className="field">
              <label htmlFor="s-trade">Nome fantasia / razão social</label>
              <input id="s-trade" value={form.trade_name} onChange={set('trade_name')} />
            </div>
            <div className="field">
              <label htmlFor="s-doc">CNPJ / CPF</label>
              <input id="s-doc" value={form.document} onChange={set('document')} />
            </div>
            <div className="field">
              <label htmlFor="s-phone">Telefone / WhatsApp</label>
              <input id="s-phone" value={form.phone} onChange={set('phone')} />
            </div>
            <div className="field">
              <label htmlFor="s-email">E-mail</label>
              <input id="s-email" type="email" value={form.email} onChange={set('email')} />
            </div>
            <div className="field">
              <label htmlFor="s-addr">Endereço</label>
              <input id="s-addr" value={form.address} onChange={set('address')} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="s-pay">Dados para pagamento</label>
            <textarea id="s-pay" rows={3} value={form.payment_info} onChange={set('payment_info')} placeholder="Ex.: Chave Pix, banco, agência e conta" />
          </div>
          <div className="field">
            <label htmlFor="s-terms">Observações padrão do orçamento</label>
            <textarea id="s-terms" rows={3} value={form.quote_terms} onChange={set('quote_terms')} />
          </div>
        </fieldset>

        {canManage && (
          <div className="dialog-actions">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        )}
      </form>

      <section className="members">
        <h2 className="section-title">Equipe</h2>
        <ul className="plain-list">
          {members.map((m) => (
            <li key={m.id}>
              <span>{m.profiles?.name || m.profiles?.email || 'Usuário'}</span>
              <span className="muted">{m.role === 'OWNER' ? 'Proprietário' : 'Equipe'}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="members">
        <button type="button" className="btn" onClick={() => void signOut()}>
          Sair da conta
        </button>
      </div>
    </>
  )
}
