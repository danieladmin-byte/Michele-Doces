import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'

export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'in') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        })
        if (error) throw error
        if (!data.session) {
          setNotice('Conta criada. Confirme seu e-mail pelo link que enviamos e depois entre aqui.')
          setMode('in')
        }
      }
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-hero">
        <span className="auth-mark">🧁</span>
        <h1>Quanto custa, de verdade, cada doce que você vende?</h1>
        <p>
          Registre suas compras, veja o custo de cada receita e saiba sua margem antes de fechar um orçamento.
        </p>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <h2>{mode === 'in' ? 'Entrar' : 'Criar conta'}</h2>

        {mode === 'up' && (
          <div className="field">
            <label htmlFor="name">Seu nome</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
        </div>

        {error && <p className="msg msg-error">{error}</p>}
        {notice && <p className="msg msg-ok">{notice}</p>}

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : 'Criar conta'}
        </button>

        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in')
            setError(null)
          }}
        >
          {mode === 'in' ? 'Ainda não tenho conta' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  )
}
