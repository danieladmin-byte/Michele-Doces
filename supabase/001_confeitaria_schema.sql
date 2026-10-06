-- =====================================================================
--  PLATAFORMA DE GESTIÓN PARA CONFEITARIA · Esquema inicial (Supabase)
--  PostgreSQL 15+  ·  Pegar completo en  Supabase > SQL Editor > Run
-- =====================================================================
--  Principios de diseño
--  1. Multiempresa: todas las tablas llevan company_id y están
--     protegidas con RLS. Las FK compuestas (id, company_id) impiden
--     mezclar datos de empresas distintas.
--  2. Las operaciones que mueven números (compras, stock, producción,
--     cotizaciones, aprobación) se hacen SOLO mediante funciones (RPC)
--     transaccionales. El cliente no puede escribir stock ni costos.
--  3. Todo se guarda en la unidad base mínima: g, ml o unit.
--  4. No se borra histórico: se usa active = false.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. TIPOS
-- ---------------------------------------------------------------------
create type public.member_role         as enum ('OWNER','ADMIN','MANAGER','STAFF');
create type public.base_unit           as enum ('g','ml','unit');
create type public.purchase_unit       as enum ('g','kg','ml','l','unit');
create type public.stock_movement_type as enum ('PURCHASE','RECIPE_PRODUCTION','MANUAL_IN','MANUAL_OUT','ADJUSTMENT','WASTE');
create type public.extra_cost_type     as enum ('LABOR','ENERGY','GAS','PACKAGING','WASTE','OTHER');
create type public.quote_status        as enum ('DRAFT','SENT','APPROVED','REJECTED','EXPIRED','CANCELLED');
create type public.order_status        as enum ('PENDING','IN_PRODUCTION','READY','DELIVERED','CANCELLED');

-- ---------------------------------------------------------------------
-- 2. TABLAS
-- ---------------------------------------------------------------------

-- Empresas y usuarios --------------------------------------------------
create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  trade_name    text,
  document      text,
  email         text,
  phone         text,
  logo_path     text,           -- ruta dentro del bucket "company-logos"
  address       text,
  payment_info  text,           -- "Dados para pagamento" del PDF
  quote_terms   text,           -- condiciones / observaciones por defecto
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text,
  email       text,
  avatar_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.company_members (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null default 'STAFF',
  created_at  timestamptz not null default now(),
  unique (company_id, user_id)
);
create index on public.company_members (user_id);

-- Contador por empresa (números de cotización / pedido) -----------------
create table public.company_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  name       text not null,
  value      integer not null default 0,
  primary key (company_id, name)
);

-- Ingredientes ---------------------------------------------------------
create table public.ingredient_categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, name)
);

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  phone       text,
  email       text,
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, company_id)
);

create table public.ingredients (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  category_id   uuid,
  unit          public.base_unit not null default 'g',          -- unidad base
  current_stock numeric(16,4) not null default 0,               -- en unidad base
  minimum_stock numeric(16,4) not null default 0 check (minimum_stock >= 0),
  avg_cost      numeric(18,8) not null default 0 check (avg_cost >= 0), -- costo medio ponderado por unidad base
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, name),
  foreign key (category_id, company_id) references public.ingredient_categories (id, company_id)
);

-- Compras --------------------------------------------------------------
create table public.purchases (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  supplier_id    uuid,
  purchase_date  date not null default current_date,
  invoice_number text,
  total          numeric(14,2) not null default 0,
  notes          text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  unique (id, company_id),
  foreign key (supplier_id, company_id) references public.suppliers (id, company_id)
);
create index on public.purchases (company_id, purchase_date desc);

create table public.purchase_items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  purchase_id   uuid not null,
  ingredient_id uuid not null,
  quantity      numeric(16,4) not null check (quantity > 0),     -- como se compró
  unit          public.purchase_unit not null,                    -- como se compró
  unit_price    numeric(18,6) not null check (unit_price >= 0),   -- por unidad de compra
  total_price   numeric(14,2) not null check (total_price >= 0),
  base_quantity numeric(16,4) not null check (base_quantity > 0), -- normalizada a g / ml / unit
  created_at    timestamptz not null default now(),
  foreign key (purchase_id, company_id)   references public.purchases   (id, company_id) on delete cascade,
  foreign key (ingredient_id, company_id) references public.ingredients (id, company_id)
);
create index on public.purchase_items (purchase_id);

-- Movimientos de stock (quantity con signo: + entra, - sale) ------------
create table public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null,
  ingredient_id  uuid not null,
  type           public.stock_movement_type not null,
  quantity       numeric(16,4) not null,          -- unidad base, con signo
  unit_cost      numeric(18,8),
  total_cost     numeric(16,4),                   -- quantity * unit_cost (con signo)
  stock_after    numeric(16,4) not null,
  reference_type text,
  reference_id   uuid,
  notes          text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  foreign key (ingredient_id, company_id) references public.ingredients (id, company_id),
  constraint stock_movements_sign check (
       (type in ('PURCHASE','MANUAL_IN')                       and quantity > 0)
    or (type in ('RECIPE_PRODUCTION','MANUAL_OUT','WASTE')     and quantity < 0)
    or (type = 'ADJUSTMENT'                                    and quantity <> 0))
);
create index on public.stock_movements (company_id, ingredient_id, created_at desc);

-- Recetas --------------------------------------------------------------
create table public.recipes (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies(id) on delete cascade,
  name                     text not null,
  description              text,
  yield_quantity           numeric(14,4) not null check (yield_quantity > 0),
  yield_unit               text not null default 'un',
  preparation_time_minutes integer check (preparation_time_minutes >= 0),
  notes                    text,
  active                   boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, name)
);

-- Un ítem es un ingrediente O una sub-receta.
-- Si es sub-receta, quantity se expresa en la unidad de rendimiento de ella
-- (ej.: sub-receta "Brigadeiro" rinde 20 un -> quantity 40 = dos tandas).
create table public.recipe_items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  recipe_id     uuid not null,
  ingredient_id uuid,
  sub_recipe_id uuid,
  quantity      numeric(16,4) not null check (quantity > 0),     -- unidad base del ingrediente
  created_at    timestamptz not null default now(),
  foreign key (recipe_id, company_id)     references public.recipes     (id, company_id) on delete cascade,
  foreign key (ingredient_id, company_id) references public.ingredients (id, company_id),
  foreign key (sub_recipe_id, company_id) references public.recipes     (id, company_id),
  check ((ingredient_id is not null)::int + (sub_recipe_id is not null)::int = 1)
);
create index on public.recipe_items (recipe_id);

-- Costos adicionales por tanda (mano de obra, energía, gas, pérdidas...)
create table public.recipe_extra_costs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  recipe_id   uuid not null,
  type        public.extra_cost_type not null,
  description text,
  amount      numeric(14,2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  foreign key (recipe_id, company_id) references public.recipes (id, company_id) on delete cascade
);
create index on public.recipe_extra_costs (recipe_id);

-- Productos y precios ---------------------------------------------------
create table public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, name)
);

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  name            text not null,
  description     text,
  category_id     uuid,
  recipe_id       uuid,                                   -- opcional (producto de reventa = sin receta)
  sale_unit       text not null default 'un',
  -- cuánto del rendimiento de la receta consume 1 unidad vendida
  -- (brigadeiro: 1 de 20 que rinde la tanda; fatia de bolo de 8: 0.125)
  recipe_quantity numeric(14,4) not null default 1 check (recipe_quantity > 0),
  packaging_cost  numeric(14,4) not null default 0 check (packaging_cost >= 0),  -- por unidad vendida
  other_cost      numeric(14,4) not null default 0 check (other_cost >= 0),      -- por unidad vendida
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, name),
  foreign key (category_id, company_id) references public.product_categories (id, company_id),
  foreign key (recipe_id, company_id)   references public.recipes (id, company_id)
);

create table public.product_prices (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null,
  product_id       uuid not null,
  name             text not null,                         -- Varejo, Atacado...
  price            numeric(14,2) not null check (price > 0),
  minimum_quantity numeric(14,2) not null default 1 check (minimum_quantity > 0),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade
);
create index on public.product_prices (product_id);

-- Clientes -------------------------------------------------------------
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  document    text,
  address     text,
  city        text,
  state       text,
  zip_code    text,
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, company_id)
);

-- Cotizaciones ---------------------------------------------------------
create table public.quotes (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  customer_id   uuid,
  number        integer not null,
  status        public.quote_status not null default 'DRAFT',
  event_name    text,
  issue_date    date not null default current_date,
  valid_until   date,
  event_date    date,
  subtotal      numeric(14,2) not null default 0,
  discount      numeric(14,2) not null default 0 check (discount >= 0),
  shipping      numeric(14,2) not null default 0 check (shipping >= 0),
  total         numeric(14,2) not null default 0,
  internal_cost numeric(14,2) not null default 0,
  profit        numeric(14,2) not null default 0,
  margin        numeric(8,2)  not null default 0,          -- % sobre el total
  notes         text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, number),
  foreign key (customer_id, company_id) references public.customers (id, company_id)
);
create index on public.quotes (company_id, status);

create table public.quote_items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  quote_id      uuid not null,
  product_id    uuid,
  description   text not null,
  quantity      numeric(14,2) not null check (quantity > 0),
  unit_price    numeric(14,2) not null check (unit_price >= 0),   -- SNAPSHOT del precio
  cost_snapshot numeric(14,6) not null default 0 check (cost_snapshot >= 0), -- SNAPSHOT del costo
  total_price   numeric(14,2) not null,
  created_at    timestamptz not null default now(),
  foreign key (quote_id, company_id)   references public.quotes   (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id)
);
create index on public.quote_items (quote_id);

-- Pedidos (copia congelada de la cotización aprobada) -------------------
create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  quote_id      uuid unique,                              -- una cotización -> un pedido
  customer_id   uuid,
  number        integer not null,
  status        public.order_status not null default 'PENDING',
  event_name    text,
  event_date    date,
  subtotal      numeric(14,2) not null default 0,
  discount      numeric(14,2) not null default 0,
  shipping      numeric(14,2) not null default 0,
  total         numeric(14,2) not null default 0,
  internal_cost numeric(14,2) not null default 0,
  profit        numeric(14,2) not null default 0,
  margin        numeric(8,2)  not null default 0,
  notes         text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, number),
  foreign key (quote_id, company_id)    references public.quotes    (id, company_id),
  foreign key (customer_id, company_id) references public.customers (id, company_id)
);
create index on public.orders (company_id, status);

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  order_id      uuid not null,
  product_id    uuid,
  description   text not null,
  quantity      numeric(14,2) not null check (quantity > 0),
  unit_price    numeric(14,2) not null,
  cost_snapshot numeric(14,6) not null default 0,
  total_price   numeric(14,2) not null,
  created_at    timestamptz not null default now(),
  foreign key (order_id, company_id)   references public.orders   (id, company_id) on delete cascade,
  foreign key (product_id, company_id) references public.products (id, company_id)
);
create index on public.order_items (order_id);

-- ---------------------------------------------------------------------
-- 3. TRIGGERS UTILITARIOS
-- ---------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['companies','profiles','suppliers','ingredients','recipes',
                           'products','customers','quotes','orders'] loop
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.set_updated_at()', t||'_updated_at', t);
  end loop;
end $$;

-- Perfil automático al registrarse un usuario en Supabase Auth
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Evita ciclos en recetas compuestas (A usa B, B usa A)
create function public.check_recipe_cycle() returns trigger
language plpgsql as $$
begin
  if new.sub_recipe_id is null then
    return new;
  end if;
  if new.sub_recipe_id = new.recipe_id then
    raise exception 'RECIPE_CYCLE: una receta no puede usarse a sí misma';
  end if;
  if exists (
    with recursive sub as (
      select ri.sub_recipe_id from public.recipe_items ri
      where ri.recipe_id = new.sub_recipe_id and ri.sub_recipe_id is not null
      union
      select ri.sub_recipe_id from public.recipe_items ri
      join sub s on ri.recipe_id = s.sub_recipe_id
      where ri.sub_recipe_id is not null
    )
    select 1 from sub where sub_recipe_id = new.recipe_id
  ) then
    raise exception 'RECIPE_CYCLE: la sub-receta crea una dependencia circular';
  end if;
  return new;
end $$;

create trigger recipe_items_no_cycle
  before insert or update on public.recipe_items
  for each row execute function public.check_recipe_cycle();

-- ---------------------------------------------------------------------
-- 4. FUNCIONES DE SEGURIDAD (usadas por las políticas RLS)
-- ---------------------------------------------------------------------

create function public.is_company_member(p_company_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members
    where company_id = p_company_id and user_id = auth.uid());
$$;

create function public.has_company_role(p_company_id uuid, p_roles public.member_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company_members
    where company_id = p_company_id and user_id = auth.uid() and role = any (p_roles));
$$;

create function public.shares_company_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.company_members a
    join public.company_members b on a.company_id = b.company_id
    where a.user_id = auth.uid() and b.user_id = p_user_id);
$$;

-- ---------------------------------------------------------------------
-- 5. UTILIDADES DE UNIDADES Y NUMERACIÓN
-- ---------------------------------------------------------------------

create function public.unit_factor(u public.purchase_unit) returns numeric
language sql immutable as $$
  select case u when 'kg' then 1000 when 'l' then 1000 else 1 end::numeric;
$$;

create function public.unit_family(u public.purchase_unit) returns text
language sql immutable as $$
  select case u when 'g' then 'g' when 'kg' then 'g'
                when 'ml' then 'ml' when 'l' then 'ml' else 'unit' end;
$$;

create function public.next_company_number(p_company_id uuid, p_name text) returns integer
language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  insert into public.company_counters (company_id, name, value)
  values (p_company_id, p_name, 1)
  on conflict (company_id, name) do update set value = company_counters.value + 1
  returning value into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 6. CÁLCULO DE COSTOS Y MARGEN
-- ---------------------------------------------------------------------

-- Costo total de UNA tanda de receta (ingredientes + sub-recetas + costos extra)
create function public.recipe_total_cost(p_recipe_id uuid, p_depth integer default 0) returns numeric
language plpgsql stable as $$
declare
  v_total numeric := 0;
  r record;
begin
  if p_depth > 10 then
    raise exception 'RECIPE_TOO_DEEP';
  end if;

  select coalesce(sum(ri.quantity * i.avg_cost), 0) into v_total
  from public.recipe_items ri
  join public.ingredients i on i.id = ri.ingredient_id
  where ri.recipe_id = p_recipe_id;

  for r in
    select ri.quantity as qty, sr.id as sub_id, sr.yield_quantity as yq
    from public.recipe_items ri
    join public.recipes sr on sr.id = ri.sub_recipe_id
    where ri.recipe_id = p_recipe_id
  loop
    v_total := v_total + r.qty * public.recipe_total_cost(r.sub_id, p_depth + 1) / r.yq;
  end loop;

  v_total := v_total + coalesce(
    (select sum(amount) from public.recipe_extra_costs where recipe_id = p_recipe_id), 0);

  return v_total;
end $$;

create function public.recipe_unit_cost(p_recipe_id uuid) returns numeric
language sql stable as $$
  select public.recipe_total_cost(r.id) / r.yield_quantity
  from public.recipes r where r.id = p_recipe_id;
$$;

-- Costo de 1 unidad vendida del producto (receta + embalaje + otros)
create function public.product_unit_cost(p_product_id uuid) returns numeric
language sql stable as $$
  select coalesce(
           case when p.recipe_id is not null
                then public.recipe_total_cost(p.recipe_id) / rc.yield_quantity * p.recipe_quantity
           end, 0)
         + p.packaging_cost + p.other_cost
  from public.products p
  left join public.recipes rc on rc.id = p.recipe_id
  where p.id = p_product_id;
$$;

-- Precio según cantidad (mejor escalón alcanzado; si no alcanza ninguno, el de menor mínimo)
create function public.product_price_for_quantity(p_product_id uuid, p_quantity numeric) returns numeric
language sql stable as $$
  select coalesce(
    (select price from public.product_prices
      where product_id = p_product_id and active and minimum_quantity <= p_quantity
      order by minimum_quantity desc limit 1),
    (select price from public.product_prices
      where product_id = p_product_id and active
      order by minimum_quantity asc limit 1));
$$;

-- Calculadora: precio = costo / (1 - margen)
create function public.suggested_price(p_cost numeric, p_margin_pct numeric) returns numeric
language plpgsql immutable as $$
begin
  if p_margin_pct is null or p_margin_pct < 0 or p_margin_pct >= 100 then
    raise exception 'INVALID_MARGIN: el margen debe estar entre 0 y 99.99';
  end if;
  return round(p_cost / (1 - p_margin_pct / 100), 2);
end $$;

-- Lista de ingredientes necesarios (aplanando sub-recetas) para N tandas
create function public.explode_recipe(p_recipe_id uuid, p_factor numeric default 1, p_depth integer default 0)
returns table (ingredient_id uuid, quantity numeric)
language plpgsql stable as $$
#variable_conflict use_column
begin
  if p_depth > 10 then
    raise exception 'RECIPE_TOO_DEEP';
  end if;

  return query
    select ri.ingredient_id, sum(ri.quantity * p_factor)
    from public.recipe_items ri
    where ri.recipe_id = p_recipe_id and ri.ingredient_id is not null
    group by ri.ingredient_id;

  return query
    select e.ingredient_id, e.quantity
    from public.recipe_items ri
    join public.recipes sr on sr.id = ri.sub_recipe_id
    cross join lateral public.explode_recipe(sr.id, ri.quantity * p_factor / sr.yield_quantity, p_depth + 1) e
    where ri.recipe_id = p_recipe_id;
end $$;

-- Vistas (security_invoker => respetan RLS del usuario que consulta) ----
create view public.recipe_cost_summary with (security_invoker = true) as
select r.id as recipe_id, r.company_id, r.name, r.yield_quantity, r.yield_unit, r.active,
       t.total_cost,
       coalesce(e.extra, 0)                   as extra_costs,        -- costos adicionales propios
       t.total_cost - coalesce(e.extra, 0)    as ingredients_cost,   -- ingredientes + sub-recetas
       t.total_cost / r.yield_quantity        as unit_cost
from public.recipes r
cross join lateral (select public.recipe_total_cost(r.id) as total_cost) t
left join lateral (select sum(x.amount) as extra
                   from public.recipe_extra_costs x where x.recipe_id = r.id) e on true;

create view public.product_cost_summary with (security_invoker = true) as
select p.id as product_id, p.company_id, p.name, p.active, p.sale_unit,
       public.product_unit_cost(p.id) as unit_cost
from public.products p;

-- Margen y markup por cada escalón de precio
create view public.product_price_margins with (security_invoker = true) as
select pp.id as price_id, pp.company_id, p.id as product_id, p.name as product_name,
       pp.name as price_name, pp.price, pp.minimum_quantity, pp.active,
       c.unit_cost,
       pp.price - c.unit_cost                                          as profit,
       round((pp.price - c.unit_cost) / pp.price * 100, 2)             as margin_pct,
       case when c.unit_cost > 0 then round(pp.price / c.unit_cost, 2) end as markup
from public.product_prices pp
join public.products p on p.id = pp.product_id
cross join lateral (select public.product_unit_cost(p.id) as unit_cost) c;

-- Dashboard
create view public.low_stock_ingredients with (security_invoker = true) as
select id, company_id, name, unit, current_stock, minimum_stock
from public.ingredients
where active and minimum_stock > 0 and current_stock <= minimum_stock;

create view public.top_selling_products with (security_invoker = true) as
select oi.company_id, oi.product_id, p.name,
       sum(oi.quantity) as quantity_sold, sum(oi.total_price) as revenue
from public.order_items oi
join public.orders o   on o.id = oi.order_id
join public.products p on p.id = oi.product_id
where o.status <> 'CANCELLED'
group by oi.company_id, oi.product_id, p.name;

create function public.dashboard_summary(p_company_id uuid)
returns table (month_sales numeric, estimated_profit numeric, open_quotes bigint, stock_value numeric)
language sql stable as $$
  select
    coalesce((select sum(o.total)  from public.orders o
              where o.company_id = p_company_id and o.status <> 'CANCELLED'
                and o.created_at >= date_trunc('month', now())), 0),
    coalesce((select sum(o.profit) from public.orders o
              where o.company_id = p_company_id and o.status <> 'CANCELLED'
                and o.created_at >= date_trunc('month', now())), 0),
    (select count(*) from public.quotes q
      where q.company_id = p_company_id and q.status in ('DRAFT','SENT')),
    coalesce((select sum(greatest(i.current_stock, 0) * i.avg_cost) from public.ingredients i
              where i.company_id = p_company_id and i.active), 0);
$$;

-- ---------------------------------------------------------------------
-- 7. OPERACIONES (RPC) — todas verifican membresía de la empresa
-- ---------------------------------------------------------------------

-- 7.1 Crear empresa (el usuario queda como OWNER + categorías por defecto)
create function public.create_company(p_name text, p_trade_name text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'INVALID_NAME';
  end if;

  insert into public.companies (name, trade_name) values (trim(p_name), p_trade_name)
  returning id into v_id;

  insert into public.company_members (company_id, user_id, role) values (v_id, auth.uid(), 'OWNER');

  insert into public.ingredient_categories (company_id, name)
  select v_id, n from unnest(array['Chocolates','Laticínios','Farinhas','Açúcares','Frutas','Embalagens','Outros']) n;

  insert into public.product_categories (company_id, name)
  select v_id, n from unnest(array['Doces','Bolos','Tortas','Kits e festas','Outros']) n;

  return v_id;
end $$;

-- 7.2 Registrar compra: sube stock, recalcula costo medio ponderado y
--     genera movimientos, todo en una sola transacción.
--  p_items: [{ "ingredient_id": "...", "quantity": 2, "unit": "kg",
--              "unit_price": 40 }  |  { ..., "total_price": 80 }]
create function public.register_purchase(
  p_company_id     uuid,
  p_supplier_id    uuid,
  p_purchase_date  date,
  p_invoice_number text,
  p_notes          text,
  p_items          jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_purchase_id uuid;
  v_item        jsonb;
  v_ing         public.ingredients%rowtype;
  v_unit        public.purchase_unit;
  v_qty         numeric;
  v_base_qty    numeric;
  v_unit_price  numeric;
  v_total       numeric;
  v_new_stock   numeric;
  v_new_avg     numeric;
  v_sum         numeric := 0;
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'PURCHASE_WITHOUT_ITEMS';
  end if;
  if p_supplier_id is not null and not exists (
       select 1 from public.suppliers where id = p_supplier_id and company_id = p_company_id) then
    raise exception 'INVALID_SUPPLIER';
  end if;

  insert into public.purchases (company_id, supplier_id, purchase_date, invoice_number, notes, created_by)
  values (p_company_id, p_supplier_id, coalesce(p_purchase_date, current_date),
          p_invoice_number, p_notes, auth.uid())
  returning id into v_purchase_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_ing from public.ingredients
    where id = (v_item->>'ingredient_id')::uuid and company_id = p_company_id
    for update;
    if not found then
      raise exception 'INVALID_INGREDIENT';
    end if;

    v_unit := (v_item->>'unit')::public.purchase_unit;
    v_qty  := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QUANTITY';
    end if;
    if public.unit_family(v_unit) <> v_ing.unit::text then
      raise exception 'UNIT_MISMATCH: % se controla en % y la compra viene en %',
        v_ing.name, v_ing.unit, v_unit;
    end if;
    v_base_qty := v_qty * public.unit_factor(v_unit);

    if nullif(v_item->>'total_price', '') is not null then
      v_total      := round((v_item->>'total_price')::numeric, 2);
      v_unit_price := v_total / v_qty;
    else
      v_unit_price := (v_item->>'unit_price')::numeric;
      v_total      := round(v_qty * v_unit_price, 2);
    end if;
    if v_total is null or v_total < 0 then
      raise exception 'INVALID_PRICE';
    end if;

    -- costo medio ponderado
    v_new_stock := v_ing.current_stock + v_base_qty;
    if v_ing.current_stock <= 0 then
      v_new_avg := v_total / v_base_qty;
    else
      v_new_avg := (v_ing.current_stock * v_ing.avg_cost + v_total) / v_new_stock;
    end if;

    update public.ingredients
       set current_stock = v_new_stock, avg_cost = v_new_avg
     where id = v_ing.id;

    insert into public.purchase_items
      (company_id, purchase_id, ingredient_id, quantity, unit, unit_price, total_price, base_quantity)
    values
      (p_company_id, v_purchase_id, v_ing.id, v_qty, v_unit, v_unit_price, v_total, v_base_qty);

    insert into public.stock_movements
      (company_id, ingredient_id, type, quantity, unit_cost, total_cost, stock_after,
       reference_type, reference_id, created_by)
    values
      (p_company_id, v_ing.id, 'PURCHASE', v_base_qty, v_total / v_base_qty, v_total, v_new_stock,
       'purchase', v_purchase_id, auth.uid());

    v_sum := v_sum + v_total;
  end loop;

  update public.purchases set total = v_sum where id = v_purchase_id;
  return v_purchase_id;
end $$;

-- 7.3 Ajuste manual de stock (entrada, salida, pérdida, ajuste de inventario)
--  MANUAL_IN / MANUAL_OUT / WASTE: p_quantity positiva (el signo lo pone el tipo)
--  ADJUSTMENT: p_quantity con signo (+ sube, - baja)
--  p_unit opcional: si es null se asume la unidad base del ingrediente.
create function public.adjust_stock(
  p_ingredient_id  uuid,
  p_type           public.stock_movement_type,
  p_quantity       numeric,
  p_unit           public.purchase_unit default null,
  p_notes          text default null,
  p_allow_negative boolean default false
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_ing    public.ingredients%rowtype;
  v_signed numeric;
  v_new    numeric;
begin
  select * into v_ing from public.ingredients where id = p_ingredient_id for update;
  if not found or not public.is_company_member(v_ing.company_id) then
    raise exception 'INGREDIENT_NOT_FOUND';
  end if;
  if p_type in ('PURCHASE', 'RECIPE_PRODUCTION') then
    raise exception 'INVALID_TYPE: use register_purchase / register_production';
  end if;
  if p_quantity is null or p_quantity = 0 then
    raise exception 'INVALID_QUANTITY';
  end if;
  if p_type <> 'ADJUSTMENT' and p_quantity < 0 then
    raise exception 'INVALID_QUANTITY: use un valor positivo';
  end if;

  v_signed := p_quantity;
  if p_unit is not null then
    if public.unit_family(p_unit) <> v_ing.unit::text then
      raise exception 'UNIT_MISMATCH';
    end if;
    v_signed := v_signed * public.unit_factor(p_unit);
  end if;
  if p_type in ('MANUAL_OUT', 'WASTE') then
    v_signed := -v_signed;
  end if;

  v_new := v_ing.current_stock + v_signed;
  if v_new < 0 and not p_allow_negative then
    raise exception 'INSUFFICIENT_STOCK: % quedaría en %', v_ing.name, v_new;
  end if;

  update public.ingredients set current_stock = v_new where id = v_ing.id;

  insert into public.stock_movements
    (company_id, ingredient_id, type, quantity, unit_cost, total_cost, stock_after,
     reference_type, notes, created_by)
  values
    (v_ing.company_id, v_ing.id, p_type, v_signed, v_ing.avg_cost, v_signed * v_ing.avg_cost,
     v_new, 'manual', p_notes, auth.uid());

  return v_new;
end $$;

-- 7.4 Registrar producción: descuenta del stock los ingredientes de N tandas
--     (incluye sub-recetas). Exige receta con ingredientes.
create function public.register_production(
  p_recipe_id      uuid,
  p_batches        numeric default 1,
  p_allow_negative boolean default false,
  p_notes          text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_recipe public.recipes%rowtype;
  r        record;
  v_ing    public.ingredients%rowtype;
  v_new    numeric;
begin
  select * into v_recipe from public.recipes where id = p_recipe_id;
  if not found or not public.is_company_member(v_recipe.company_id) then
    raise exception 'RECIPE_NOT_FOUND';
  end if;
  if not v_recipe.active then
    raise exception 'RECIPE_INACTIVE';
  end if;
  if p_batches is null or p_batches <= 0 then
    raise exception 'INVALID_QUANTITY';
  end if;
  if not exists (select 1 from public.recipe_items where recipe_id = p_recipe_id) then
    raise exception 'RECIPE_WITHOUT_ITEMS';
  end if;

  for r in
    select e.ingredient_id as ing_id, sum(e.quantity) as qty
    from public.explode_recipe(p_recipe_id, p_batches) e
    group by e.ingredient_id
  loop
    select * into v_ing from public.ingredients where id = r.ing_id for update;
    v_new := v_ing.current_stock - r.qty;
    if v_new < 0 and not p_allow_negative then
      raise exception 'INSUFFICIENT_STOCK: % quedaría en %', v_ing.name, v_new;
    end if;

    update public.ingredients set current_stock = v_new where id = v_ing.id;

    insert into public.stock_movements
      (company_id, ingredient_id, type, quantity, unit_cost, total_cost, stock_after,
       reference_type, reference_id, notes, created_by)
    values
      (v_ing.company_id, v_ing.id, 'RECIPE_PRODUCTION', -r.qty, v_ing.avg_cost,
       -r.qty * v_ing.avg_cost, v_new, 'recipe', p_recipe_id, p_notes, auth.uid());
  end loop;
end $$;

-- 7.5 Guardar cotización (crear o editar BORRADOR).
--  Congela precio y costo de cada ítem en el momento de guardar.
--  Una vez que sale de DRAFT ya no se puede editar => el snapshot queda fijo.
--  p_items: [{ "product_id": "...", "quantity": 100, "unit_price": 2.5 (opcional) }
--            | { "description": "Servicio", "quantity": 1, "unit_price": 50, "cost": 20 }]
create function public.save_quote(
  p_company_id  uuid,
  p_quote_id    uuid,
  p_customer_id uuid,
  p_event_name  text,
  p_issue_date  date,
  p_valid_until date,
  p_event_date  date,
  p_discount    numeric,
  p_shipping    numeric,
  p_notes       text,
  p_items       jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_quote_id  uuid := p_quote_id;
  v_status    public.quote_status;
  v_item      jsonb;
  v_prod      public.products%rowtype;
  v_qty       numeric;
  v_price     numeric;
  v_cost      numeric;
  v_desc      text;
  v_discount  numeric := coalesce(p_discount, 0);
  v_shipping  numeric := coalesce(p_shipping, 0);
  v_subtotal  numeric;
  v_cost_tot  numeric;
  v_total     numeric;
  v_profit    numeric;
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'QUOTE_WITHOUT_ITEMS';
  end if;
  if v_discount < 0 or v_shipping < 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_customer_id is not null and not exists (
       select 1 from public.customers where id = p_customer_id and company_id = p_company_id) then
    raise exception 'INVALID_CUSTOMER';
  end if;

  if v_quote_id is null then
    insert into public.quotes
      (company_id, customer_id, number, event_name, issue_date, valid_until, event_date,
       discount, shipping, notes, created_by)
    values
      (p_company_id, p_customer_id, public.next_company_number(p_company_id, 'quote'),
       p_event_name, coalesce(p_issue_date, current_date), p_valid_until, p_event_date,
       v_discount, v_shipping, p_notes, auth.uid())
    returning id into v_quote_id;
  else
    select status into v_status from public.quotes
    where id = v_quote_id and company_id = p_company_id for update;
    if not found then
      raise exception 'QUOTE_NOT_FOUND';
    end if;
    if v_status <> 'DRAFT' then
      raise exception 'QUOTE_NOT_EDITABLE: solo se editan cotizaciones en borrador';
    end if;
    update public.quotes
       set customer_id = p_customer_id, event_name = p_event_name,
           issue_date = coalesce(p_issue_date, issue_date),
           valid_until = p_valid_until, event_date = p_event_date,
           discount = v_discount, shipping = v_shipping, notes = p_notes
     where id = v_quote_id;
    delete from public.quote_items where quote_id = v_quote_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty   := (v_item->>'quantity')::numeric;
    v_price := nullif(v_item->>'unit_price', '')::numeric;
    v_desc  := nullif(trim(v_item->>'description'), '');
    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QUANTITY';
    end if;

    if nullif(v_item->>'product_id', '') is not null then
      select * into v_prod from public.products
      where id = (v_item->>'product_id')::uuid and company_id = p_company_id and active;
      if not found then
        raise exception 'INVALID_PRODUCT';
      end if;
      if not exists (select 1 from public.product_prices where product_id = v_prod.id and active) then
        raise exception 'PRODUCT_WITHOUT_PRICE: %', v_prod.name;
      end if;
      v_cost  := public.product_unit_cost(v_prod.id);
      v_price := coalesce(v_price, public.product_price_for_quantity(v_prod.id, v_qty));
      v_desc  := coalesce(v_desc, v_prod.name);
    else
      if v_desc is null then
        raise exception 'ITEM_WITHOUT_DESCRIPTION';
      end if;
      v_cost := coalesce(nullif(v_item->>'cost', '')::numeric, 0);
    end if;

    if v_price is null or v_price < 0 then
      raise exception 'INVALID_PRICE';
    end if;

    insert into public.quote_items
      (company_id, quote_id, product_id, description, quantity, unit_price, cost_snapshot, total_price)
    values
      (p_company_id, v_quote_id, nullif(v_item->>'product_id', '')::uuid, v_desc, v_qty,
       v_price, v_cost, round(v_qty * v_price, 2));
  end loop;

  select coalesce(sum(total_price), 0), round(coalesce(sum(quantity * cost_snapshot), 0), 2)
    into v_subtotal, v_cost_tot
  from public.quote_items where quote_id = v_quote_id;

  v_total := v_subtotal - v_discount + v_shipping;
  if v_total < 0 then
    raise exception 'DISCOUNT_EXCEEDS_TOTAL';
  end if;
  v_profit := v_total - v_cost_tot;

  update public.quotes
     set subtotal = v_subtotal, total = v_total, internal_cost = v_cost_tot,
         profit = v_profit,
         margin = case when v_total > 0 then round(v_profit / v_total * 100, 2) else 0 end
   where id = v_quote_id;

  return v_quote_id;
end $$;

-- 7.6 Cambiar estado (SENT, REJECTED, EXPIRED, CANCELLED, vuelta a DRAFT)
create function public.set_quote_status(p_quote_id uuid, p_status public.quote_status) returns void
language plpgsql security definer set search_path = public as $$
declare v_q public.quotes%rowtype;
begin
  select * into v_q from public.quotes where id = p_quote_id for update;
  if not found or not public.is_company_member(v_q.company_id) then
    raise exception 'QUOTE_NOT_FOUND';
  end if;
  if p_status = 'APPROVED' then
    raise exception 'USE_APPROVE_QUOTE';
  end if;
  if v_q.status = 'APPROVED' then
    raise exception 'QUOTE_ALREADY_APPROVED';
  end if;
  update public.quotes set status = p_status where id = p_quote_id;
end $$;

-- 7.7 Aprobar cotización -> crea el pedido con copia congelada de los ítems
create function public.approve_quote(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_q        public.quotes%rowtype;
  v_order_id uuid;
begin
  select * into v_q from public.quotes where id = p_quote_id for update;
  if not found or not public.is_company_member(v_q.company_id) then
    raise exception 'QUOTE_NOT_FOUND';
  end if;
  if v_q.status = 'APPROVED' then
    raise exception 'QUOTE_ALREADY_APPROVED';
  end if;
  if v_q.status in ('REJECTED', 'CANCELLED', 'EXPIRED') then
    raise exception 'QUOTE_NOT_APPROVABLE';
  end if;

  update public.quotes set status = 'APPROVED' where id = v_q.id;

  insert into public.orders
    (company_id, quote_id, customer_id, number, event_name, event_date, subtotal, discount,
     shipping, total, internal_cost, profit, margin, notes, created_by)
  values
    (v_q.company_id, v_q.id, v_q.customer_id, public.next_company_number(v_q.company_id, 'order'),
     v_q.event_name, v_q.event_date, v_q.subtotal, v_q.discount, v_q.shipping, v_q.total,
     v_q.internal_cost, v_q.profit, v_q.margin, v_q.notes, auth.uid())
  returning id into v_order_id;

  insert into public.order_items
    (company_id, order_id, product_id, description, quantity, unit_price, cost_snapshot, total_price)
  select company_id, v_order_id, product_id, description, quantity, unit_price, cost_snapshot, total_price
  from public.quote_items where quote_id = v_q.id;

  return v_order_id;
end $$;

-- ---------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.companies        enable row level security;
alter table public.profiles         enable row level security;
alter table public.company_members  enable row level security;
alter table public.company_counters enable row level security;   -- sin políticas: solo funciones internas

create policy companies_select on public.companies for select to authenticated
  using (public.is_company_member(id));
create policy companies_update on public.companies for update to authenticated
  using (public.has_company_role(id, array['OWNER','ADMIN']::public.member_role[]))
  with check (public.has_company_role(id, array['OWNER','ADMIN']::public.member_role[]));

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_company_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy members_select on public.company_members for select to authenticated
  using (public.is_company_member(company_id));
create policy members_insert on public.company_members for insert to authenticated
  with check (public.has_company_role(company_id, array['OWNER']::public.member_role[]));
create policy members_update on public.company_members for update to authenticated
  using (public.has_company_role(company_id, array['OWNER']::public.member_role[]))
  with check (public.has_company_role(company_id, array['OWNER']::public.member_role[]));
create policy members_delete on public.company_members for delete to authenticated
  using (public.has_company_role(company_id, array['OWNER']::public.member_role[]));

do $$
declare
  t text;
  tenant_tables text[] := array[
    'ingredient_categories','suppliers','ingredients','purchases','purchase_items','stock_movements',
    'recipes','recipe_items','recipe_extra_costs','product_categories','products','product_prices',
    'customers','quotes','quote_items','orders','order_items'];
  writable_tables text[] := array[
    'ingredient_categories','suppliers','ingredients','recipes','recipe_items','recipe_extra_costs',
    'product_categories','products','product_prices','customers'];
  deletable_tables text[] := array[
    'ingredient_categories','recipe_items','recipe_extra_costs','product_categories','product_prices'];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using (public.is_company_member(company_id))', t||'_select', t);
  end loop;
  foreach t in array writable_tables loop
    execute format('create policy %I on public.%I for insert to authenticated
                    with check (public.is_company_member(company_id))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated
                    using (public.is_company_member(company_id))
                    with check (public.is_company_member(company_id))', t||'_update', t);
  end loop;
  foreach t in array deletable_tables loop
    execute format('create policy %I on public.%I for delete to authenticated
                    using (public.is_company_member(company_id))', t||'_delete', t);
  end loop;
end $$;

-- Pedidos: se puede cambiar estado y notas (se crean solo con approve_quote)
create policy orders_update on public.orders for update to authenticated
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));

-- ---------------------------------------------------------------------
-- 9. PERMISOS (GRANT) — mínimo necesario
--    Stock, costos, compras y cotizaciones NO son escribibles directamente.
-- ---------------------------------------------------------------------

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant select on all tables in schema public to authenticated;
revoke select on public.company_counters from authenticated;

grant update (name, trade_name, document, email, phone, logo_path, address, payment_info, quote_terms)
  on public.companies to authenticated;
grant update (name, avatar_path) on public.profiles to authenticated;
grant insert, delete on public.company_members to authenticated;
grant update (role) on public.company_members to authenticated;

grant insert, update on public.suppliers, public.recipes, public.products, public.customers to authenticated;
grant insert, update, delete on public.ingredient_categories, public.product_categories,
      public.recipe_items, public.recipe_extra_costs, public.product_prices to authenticated;

-- Ingredientes: stock y costo medio solo los cambian las funciones
grant insert (company_id, name, category_id, unit, minimum_stock, active) on public.ingredients to authenticated;
grant update (name, category_id, minimum_stock, active)                   on public.ingredients to authenticated;

grant update (status, notes, event_date) on public.orders to authenticated;

grant execute on all functions in schema public to authenticated;
revoke execute on function public.next_company_number(uuid, text) from authenticated;
revoke execute on function public.handle_new_user()               from authenticated;

-- ---------------------------------------------------------------------
-- 10. STORAGE: logos de empresa (carpeta = company_id)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', true)
on conflict (id) do nothing;

create policy logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'company-logos'
              and public.is_company_member(((storage.foldername(name))[1])::uuid));
create policy logos_update on storage.objects for update to authenticated
  using (bucket_id = 'company-logos'
         and public.is_company_member(((storage.foldername(name))[1])::uuid));
create policy logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-logos'
         and public.is_company_member(((storage.foldername(name))[1])::uuid));

commit;
