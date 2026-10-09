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
  /** Existe después de la migración 004. */
  instagram?: string | null
  /** Existe después de la migración 007: QR PIX que se muestra en el cardápio. */
  menu_pix_id?: string | null
}

export type Category = { id: string; name: string }
export type Supplier = { id: string; name: string }

export type CostSource = 'MANUAL' | 'COMPRAS' | 'EMBALAGEM' | 'SEM_CUSTO'

export type Ingredient = {
  id: string
  name: string
  brand: string | null
  notes: string | null
  category_id: string | null
  default_supplier_id: string | null
  unit: BaseUnit
  current_stock: number
  minimum_stock: number
  avg_cost: number
  /** Datos del envase, en unidad base (ej.: 400 g a R$ 42,98). */
  pack_quantity: number | null
  pack_price: number | null
  /** Costo escrito a mano, por unidad base. Si existe, manda sobre todo lo demás. */
  manual_cost: number | null
  /** Costo efectivo por unidad base (calculado por la base de datos). */
  cost: number
  cost_source: CostSource
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

// ---------------------------------------------------------------- recetas y productos
export type Section = 'PRODUCT' | 'PACKAGING'
export type Basis = 'BATCH' | 'UNIT'
export type ExtraType = 'LABOR' | 'ENERGY' | 'GAS' | 'WASTE' | 'OTHER'

export type Recipe = {
  id: string
  name: string
  description: string | null
  preparation_time_minutes: number | null
  notes: string | null
  active: boolean
}

export type RecipeCost = {
  recipe_id: string
  name: string
  active: boolean
  cost_product: number
  cost_packaging: number
  cost_labor: number
  total_cost: number
}

/** Línea de receta o de producto: un ingrediente o una receta. */
export type CostLine = {
  id: string
  section: Section
  basis?: Basis // solo en productos
  ingredient_id: string | null
  recipe_id: string | null // en recetas se llama sub_recipe_id (se normaliza al cargar)
  quantity: number
  manual_cost: number | null
}

export type ExtraCost = {
  id: string
  basis?: Basis // solo en productos
  type: ExtraType
  description: string | null
  minutes: number | null
  hourly_rate: number | null
  amount: number
}

export type Product = {
  id: string
  name: string
  description: string | null
  category_id: string | null
  sale_unit: string
  active: boolean
  image_path?: string | null
}

export type ProductFormat = {
  id: string
  product_id: string
  name: string
  units_per_batch: number
  active: boolean
  sort_order: number
}

export type FormatCost = {
  format_id: string
  product_id: string
  product_name: string
  category_id: string | null
  product_active: boolean
  format_name: string
  units_per_batch: number
  active: boolean
  sort_order: number
  cost_product: number
  cost_packaging: number
  cost_labor: number
  cost_total: number
  batch_total: number
}

export type ProductPrice = {
  id: string
  product_id: string
  format_id: string
  name: string
  price: number
  bundle_size: number
  minimum_quantity: number
  active: boolean
  auto_quote: boolean
}

/** Una fila de product_price_margins: precio + costo + margen de un formato. */
export type PriceMargin = {
  price_id: string
  product_id: string
  format_id: string
  product_name: string
  category_id: string | null
  format_name: string
  units_per_batch: number
  price_name: string
  price: number
  bundle_size: number
  minimum_quantity: number
  active: boolean
  auto_quote: boolean
  unit_price: number
  unit_cost: number
  profit: number
  margin_pct: number | null
  markup: number | null
  price_per_100: number
  cost_per_100: number
  batch_profit: number
}

export type ProductCategory = { id: string; name: string }

// ---------------------------------------------------------------- clientes, orçamentos, pedidos
export type Customer = {
  id: string
  name: string
  email: string | null
  phone: string | null
  document: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  notes: string | null
  active: boolean
}

export type QuoteStatus = 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED'
export type OrderStatus = 'PENDING' | 'IN_PRODUCTION' | 'READY' | 'DELIVERED' | 'CANCELLED'

export type Quote = {
  id: string
  customer_id: string | null
  number: number
  status: QuoteStatus
  event_name: string | null
  issue_date: string
  valid_until: string | null
  event_date: string | null
  subtotal: number
  discount: number
  shipping: number
  total: number
  internal_cost: number
  profit: number
  margin: number
  notes: string | null
  created_at: string
}

export type DocItem = {
  id: string
  product_id: string | null
  format_id: string | null
  description: string
  quantity: number
  unit_price: number
  cost_snapshot: number
  total_price: number
}

export type Order = {
  id: string
  quote_id: string | null
  customer_id: string | null
  number: number
  status: OrderStatus
  event_name: string | null
  event_date: string | null
  subtotal: number
  discount: number
  shipping: number
  total: number
  internal_cost: number
  profit: number
  margin: number
  notes: string | null
  created_at: string
}

export type PixAccount = { id: string; name: string; image_path: string }
export type MenuItem = { id: string; price_id: string }
