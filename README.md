# Doce Gestão

Plataforma web para pequenos negócios de confeitaria: ingredientes, compras, estoque, custo real e (próximas etapas) receitas, produtos, margem e orçamentos.

**Stack:** React + Vite + TypeScript · Supabase (banco, login, arquivos) · Vercel (hospedagem).

## O que já funciona (Sprints 1–2)

- Login e criação de conta; cada usuário cria a sua confeitaria (multiempresa, isolada por RLS)
- Painel inicial com vendas do mês, lucro estimado, orçamentos abertos, valor em estoque e estoque baixo
- Ingredientes com categorias, estoque mínimo e **custo médio ponderado** automático
- Compras (formato de recibo) que atualizam estoque e custo em uma única transação
- Movimentações de estoque e ajustes (entrada, saída, perda, contagem), com confirmação antes de ficar negativo
- Configurações da empresa (dados, logo, pagamento) para os futuros PDFs

Próximas etapas: Receitas → Produtos e preços → Clientes e orçamentos (PDF) → Pedidos.

---

## Como colocar no ar (primeira vez)

### 1) Supabase (banco de dados)
1. Crie um projeto em <https://supabase.com>.
2. Abra **SQL Editor → New query**, cole **todo** o conteúdo de `supabase/001_confeitaria_schema.sql` e clique em **Run** (uma única vez).
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
src/lib/        cliente Supabase, autenticação, formatação
src/components/ layout, diálogos, avisos
src/pages/      Início, Ingredientes, Compras, Movimentações, Configurações
```

## Regras importantes (garantidas no banco)

- Estoque, custo médio e cotações **não** podem ser alterados diretamente pelo navegador; só pelas funções do banco (`register_purchase`, `adjust_stock`, `register_production`, `save_quote`, `approve_quote`).
- Tudo é guardado na menor unidade (g, ml, un). Compre em kg ou L, o sistema converte.
- Dados históricos não são apagados: usa-se "inativo".
