import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Dashboard } from './pages/Dashboard'
import { Ingredients } from './pages/Ingredients'
import { Purchases } from './pages/Purchases'
import { NewPurchase } from './pages/NewPurchase'
import { Movements } from './pages/Movements'
import { Settings } from './pages/Settings'

export default function App() {
  const { session, loading, company } = useAuth()

  if (!isConfigured) {
    return (
      <div className="splash">
        <div className="auth-form">
          <h2>Falta conectar o Supabase</h2>
          <p>
            Defina as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (no Vercel em
            Settings → Environment Variables, ou em um arquivo <code>.env.local</code>) e publique novamente.
          </p>
        </div>
      </div>
    )
  }

  if (loading) return <div className="splash">Carregando…</div>
  if (!session) return <Login />
  if (!company) return <Onboarding />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="ingredientes" element={<Ingredients />} />
        <Route path="compras" element={<Purchases />} />
        <Route path="compras/nova" element={<NewPurchase />} />
        <Route path="movimentacoes" element={<Movements />} />
        <Route path="configuracoes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
