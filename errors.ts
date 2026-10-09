const MESSAGES: Record<string, string> = {
  INSUFFICIENT_STOCK: 'Estoque insuficiente.',
  UNIT_MISMATCH: 'A unidade escolhida não combina com a unidade de controle do ingrediente.',
  INVALID_INGREDIENT: 'Ingrediente inválido.',
  INVALID_QUANTITY: 'Quantidade inválida.',
  INVALID_PRICE: 'Valor inválido.',
  INVALID_SUPPLIER: 'Fornecedor inválido.',
  PURCHASE_WITHOUT_ITEMS: 'Adicione ao menos um item à compra.',
  FORBIDDEN: 'Você não tem permissão para fazer isso.',
  INGREDIENT_NOT_FOUND: 'Ingrediente não encontrado.',
  RECIPE_CYCLE: 'Uma receita não pode usar a si mesma (nem indiretamente por outra receita).',
  RECIPE_TOO_DEEP: 'Receitas aninhadas demais.',
  RECIPE_WITHOUT_ITEMS: 'A receita ainda não tem ingredientes.',
  RECIPE_INACTIVE: 'Esta receita está inativa.',
  RECIPE_NOT_FOUND: 'Receita não encontrada.',
  PRODUCT_NOT_FOUND: 'Produto não encontrado.',
  PRODUCT_WITHOUT_FORMAT: 'O produto não tem um formato ativo.',
  PRODUCT_WITHOUT_PRICE: 'O produto não tem preço cadastrado.',
  INVALID_NAME: 'Informe um nome.',
  QUOTE_WITHOUT_ITEMS: 'Adicione ao menos um item ao orçamento.',
  INVALID_AMOUNT: 'Desconto ou frete inválido.',
  INVALID_CUSTOMER: 'Cliente inválido.',
  INVALID_PRODUCT: 'Produto inválido ou inativo.',
  ITEM_WITHOUT_DESCRIPTION: 'Todo item precisa de uma descrição.',
  DISCOUNT_EXCEEDS_TOTAL: 'O desconto é maior que o total.',
  QUOTE_NOT_FOUND: 'Orçamento não encontrado.',
  QUOTE_NOT_EDITABLE: 'Só dá para editar orçamentos em rascunho.',
  QUOTE_ALREADY_APPROVED: 'Este orçamento já foi aprovado.',
  QUOTE_HAS_ORDER: 'Este orçamento já virou pedido e não pode ser excluído.',
  QUOTE_NOT_APPROVABLE: 'Este orçamento não pode mais ser aprovado.',
}

export function errorCode(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : (err as { message?: string })?.message
  if (!msg) return null
  const m = msg.match(/^[A-Z_]{4,}/)
  return m ? m[0] : null
}

export function friendlyError(err: unknown): string {
  const raw = (err as { message?: string })?.message ?? String(err)
  const code = errorCode(err)
  if (code && MESSAGES[code]) return MESSAGES[code]
  if (/duplicate key|already exists/i.test(raw)) return 'Já existe um registro com esse nome.'
  if (/Invalid login credentials/i.test(raw)) return 'E-mail ou senha incorretos.'
  if (/User already registered/i.test(raw)) return 'Este e-mail já está cadastrado. Entre com sua senha.'
  if (/Email not confirmed/i.test(raw)) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).'
  if (/Password should be at least/i.test(raw)) return 'A senha precisa ter ao menos 6 caracteres.'
  if (/row-level security|permission denied/i.test(raw)) return 'Você não tem permissão para fazer isso.'
  return raw
}
