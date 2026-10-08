import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendlyError } from '../lib/errors'

export function Onboarding() {
  const { reload, selectCompany, signOut, session } = useAuth()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('create_company', { p_name: name })
    if (error) {
      setError(friendlyError(error))
      setBusy(false)
      return
    }
    selectCompany(data as string)
    await reload()
    setBusy(false)
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <img src="/logo.jpg" alt="" className="auth-logo" />
        <h1>Vamos preparar sua confeitaria</h1>
        <p>Dê um nome ao seu negócio. Você poderá completar logo, endereço e dados de pagamento depois, em Configurações.</p>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <h2>Nome da confeitaria</h2>
        <div className="field">
          <label htmlFor="company">Como seus clientes conhecem o negócio?</label>
          <input id="company" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </div>
        {error && <p className="msg msg-error">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !name.trim()}>
          {busy ? 'Criando…' : 'Criar confeitaria'}
        </button>
        <button type="button" className="link-btn" onClick={() => void signOut()}>
          Sair ({session?.user.email})
        </button>
      </form>
    </div>
  )
}
