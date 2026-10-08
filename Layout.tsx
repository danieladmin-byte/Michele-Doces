import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from './auth'
import { supabase } from './supabase'
import logoImg from './logo.jpg'

const NAV = [
  { to: '/', label: 'Início', icon: '◐', end: true },
  { to: '/ingredientes', label: 'Ingredientes', short: 'Insumos', icon: '◍' },
  { to: '/receitas', label: 'Receitas', icon: '❦' },
  { to: '/produtos', label: 'Produtos', icon: '◆' },
  { to: '/tabela', label: 'Preços', icon: '％' },
  { to: '/compras', label: 'Compras', icon: '❖' },
  { to: '/movimentacoes', label: 'Movimentações', short: 'Estoque', icon: '⇅' },
  { to: '/configuracoes', label: 'Configurações', short: 'Ajustes', icon: '✱' },
]

const SOON = ['Orçamentos']

export function Layout() {
  const { company, session, signOut, memberships, selectCompany } = useAuth()
  const logoUrl = company?.logo_path
    ? supabase.storage.from('company-logos').getPublicUrl(company.logo_path).data.publicUrl
    : null

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={logoUrl ?? logoImg} alt="" className="brand-logo" />
          <div className="brand-text">
            {memberships.length > 1 ? (
              <select
                className="brand-select"
                value={company?.id}
                onChange={(e) => selectCompany(e.target.value)}
                aria-label="Empresa"
              >
                {memberships.map((m) => (
                  <option key={m.company.id} value={m.company.id}>
                    {m.company.name}
                  </option>
                ))}
              </select>
            ) : (
              <strong>{company?.name}</strong>
            )}
            <span>Gestão de doces</span>
          </div>
        </div>

        <nav className="nav" aria-label="Principal">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <span className="nav-icon" aria-hidden="true">
                {n.icon}
              </span>
              <span className="nav-label">{n.label}</span>
              <span className="nav-short">{n.short ?? n.label}</span>
            </NavLink>
          ))}
          <div className="nav-soon">
            {SOON.map((s) => (
              <span key={s} className="nav-link nav-link-off" aria-disabled="true">
                <span className="nav-icon" aria-hidden="true">
                  ·
                </span>
                {s}
                <small>em breve</small>
              </span>
            ))}
          </div>
        </nav>

        <div className="sidebar-foot">
          <span title={session?.user.email ?? ''}>{session?.user.email}</span>
          <button type="button" className="link-btn" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
