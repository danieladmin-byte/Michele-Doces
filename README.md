# Michele Doces · Gestão

Plataforma web para pequenos negócios de confeitaria: ingredientes, compras, estoque, custo real e (próximas etapas) receitas, produtos, margem e orçamentos.

**Stack:** React + Vite + TypeScript · Supabase (banco, login, arquivos) · Vercel (hospedagem).

## O que já funciona

- Login, criação de conta e confeitaria (multiempresa, isolada por RLS)
- **Ingredientes**: marca, fornecedor, embalagem (quantidade + preço), custo manual e custo médio das compras. O custo usado é, nesta ordem: manual → média das compras → preço da embalagem
- **Receitas**: custo de uma tanda separado em **Produto / Embalagem / Mão de obra** (somados no fim). Uma receita pode usar outra (0,5 tanda, 2 tandas…). Sem rendimento: ele só existe nos produtos
- **Produtos por família** (Brigadeiro, Beijinho, Leite Ninho, Maracujá, Bombom…), cada um com **formatos** (18g, 13g) e o rendimento de cada um. Linhas de custo "por tanda" ou "por unidade"
- **Preços e margem ao vivo**: mude o preço (varejo, atacado, kit 4, kit 9…) e veja margem, lucro, markup, preço do cento e lucro da tanda na hora; "quero margem de X%" sugere o preço
- **Tabela de preços** com todos os produtos lado a lado (por unidade ou por cento)
- Compras, movimentações de estoque, produção de receitas e configurações da empresa

Próximas etapas: Clientes → Orçamentos com PDF (modelo em `docs/modelo-orcamento.jpg`) → Pedidos.

---

## Como colocar no ar (primeira vez)

### 1) Supabase (banco de dados)
1. Crie um projeto em <https://supabase.com>.
2. Abra **SQL Editor → New query** e rode, **uma vez cada e nesta ordem**: `supabase/001_confeitaria_schema.sql` e depois `supabase/002_receitas_produtos_v2.sql`.
   - Depois entre no app e crie a confeitaria. Só então rode `supabase/003_dados_da_planilha.sql`: carrega ingredientes, receitas, produtos e preços da planilha da Michele (ele se recusa a rodar duas vezes).
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public** (nunca a `service_role`).
4. *(Opcional, para testar)* em **Authentication → Providers → Email**, desative "Confirm email".

### 2) GitHub (código)
1. Em <https://github.com/new> crie um repositório (por exemplo `doce-gestao`), privado ou público.
2. Na página do repositório vazio, clique em **uploading an existing file**.
3. Descompacte o ZIP e arraste **o conteúdo da pasta** (não a pasta em si). Atenção: arquivos que começam com ponto (`.gitignore`, `.env.example`) ficam ocultos; no Mac use `Cmd + Shift + .` no Finder para vê-los.
4. Clique em **Commit changes**.

### 3) Vercel (hospedagem)
1. Entre em <https://vercel.com> com **Continue with GitHub**.
2. **Add New → Project** e importe o repositório. O Vercel reconhece Vite sozinho.
3. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` = a Project URL
   - `VITE_SUPABASE_ANON_KEY` = a chave anon public
4. Clique em **Deploy**.

### 4) Último ajuste no Supabase
Com o endereço que o Vercel deu (`https://seu-app.vercel.app`), vá em **Authentication → URL Configuration** e coloque-o em **Site URL** e em **Redirect URLs**. Sem isso, o link de confirmação por e-mail aponta para `localhost`.

A partir daí, cada `git push` (ou upload no GitHub) publica uma nova versão automaticamente.

---

## Rodar no seu computador (opcional)

```bash
cp .env.example .env.local   # preencha as duas variáveis
npm install
npm run dev
```

## Estrutura

```
supabase/001_confeitaria_schema.sql   banco: tabelas, regras de custo/estoque, RLS
supabase/002_receitas_produtos_v2.sql receitas, formatos, preços, margens, duplicar produto
supabase/003_dados_da_planilha.sql    dados da planilha da Michele (opcional, uma vez)
src/lib/        cliente Supabase, autenticação, formatação, costing.ts e pricing.ts (fórmulas)
src/components/ layout, diálogos, CostBuilder (produto/embalagem/mão de obra), PriceEditor
src/pages/      Início, Ingredientes, Receitas, Produtos, Preços, Compras, Movimentações, Configurações
```

## Regras importantes (garantidas no banco)

- Margem = (preço − custo) ÷ preço; markup = preço ÷ custo; preço sugerido = custo ÷ (1 − margem). Custos oficiais são calculados no banco; a tela só mostra.
- Estoque, custo médio e cotações **não** podem ser alterados diretamente pelo navegador; só pelas funções do banco (`register_purchase`, `adjust_stock`, `register_production`, `save_quote`, `approve_quote`).
- Tudo é guardado na menor unidade (g, ml, un). Compre em kg ou L, o sistema converte.
- Dados históricos não são apagados: usa-se "inativo".
