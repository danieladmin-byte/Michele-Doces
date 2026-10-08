import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import { isConfigured } from './supabase'
import { Layout } from './Layout'
import { Login } from './Login'
import { Onboarding } from './Onboarding'
import { Dashboard } from './Dashboard'
import { Ingredients } from './Ingredients'
import { Recipes } from './Recipes'
import { RecipeDetail } from './RecipeDetail'
import { Products } from './Products'
import { ProductDetail } from './ProductDetail'
import { PriceTable } from './PriceTable'
import { Purchases } from './Purchases'
import { NewPurchase } from './NewPurchase'
import { Movements } from './Movements'
import { Settings } from './Settings'

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
        <Route path="receitas" element={<Recipes />} />
        <Route path="receitas/:id" element={<RecipeDetail />} />
        <Route path="produtos" element={<Products />} />
        <Route path="produtos/:id" element={<ProductDetail />} />
        <Route path="tabela" element={<PriceTable />} />
        <Route path="compras" element={<Purchases />} />
        <Route path="compras/nova" element={<NewPurchase />} />
        <Route path="movimentacoes" element={<Movements />} />
        <Route path="configuracoes" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
