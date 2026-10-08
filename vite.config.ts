import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Expone al navegador solo las variables públicas. NO agregar 'SUPABASE_' aquí (hay claves secretas con ese prefijo).
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
