export type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF'
export type BaseUnit = 'g' | 'ml' | 'unit'
export type PurchaseUnit = 'g' | 'kg' | 'ml' | 'l' | 'unit'

export type Company = {
  id: string
  name: string
  trade_name: string | null
  document: string | null
  email: string | null
  phone: string | null
  logo_path: string | null
  address: string | null
  payment_info: string | null
  quote_terms: string | null
}

export type Category = { id: string; name: string }
export type Supplier = { id: string; name: string }

export type Ingredient = {
  id: string
  name: string
  category_id: string | null
  unit: BaseUnit
  current_stock: number
  minimum_stock: number
  avg_cost: number
  active: boolean
}

export type Purchase = {
  id: string
  supplier_id: string | null
  purchase_date: string
  invoice_number: string | null
  total: number
  notes: string | null
}

export type PurchaseItem = {
  id: string
  ingredient_id: string
  quantity: number
  unit: PurchaseUnit
  total_price: number
}

export type MovementType =
  | 'PURCHASE'
  | 'RECIPE_PRODUCTION'
  | 'MANUAL_IN'
  | 'MANUAL_OUT'
  | 'ADJUSTMENT'
  | 'WASTE'

export type StockMovement = {
  id: string
  ingredient_id: string
  type: MovementType
  quantity: number
  stock_after: number
  notes: string | null
  created_at: string
}
