-- =====================================================================
--  MIGRACIÓN 002 · Ingredientes, Recetas y Productos (lógica de la planilla)
--  Pegar completo en  Supabase > SQL Editor > Run  (UNA sola vez,
--  después de haber ejecutado 001_confeitaria_schema.sql)
-- =====================================================================
--  Qué cambia respecto a la versión 001
--
--  INGREDIENTES
--    · Guardan marca, proveedor, tamaño y precio del envase (como la hoja
--      "Ingredientes") y un costo manual opcional.
--    · Costo usado en recetas (columna "cost"), por orden de prioridad:
--        1. costo manual (si lo escribes a mano)
--        2. costo medio ponderado de las compras registradas
--        3. precio del envase / cantidad del envase
--
--  RECETAS
--    · Ya NO tienen rendimiento (el rendimiento vive en cada producto).
--    · Cada línea va en una sección: PRODUCTO o EMBALAJE; además hay
--      líneas de mano de obra/otros costos. Una línea puede ser un
--      ingrediente o otra receta (cantidad = nº de tandas, admite 0,5).
--    · Cada línea acepta un costo manual que reemplaza al calculado.
--
--  PRODUCTOS (una "familia" = categoría: Brigadeiro, Beijinho, Bombom…)
--    · Tienen FORMATOS (18 g, 13 g…), cada uno con su rendimiento
--      (unidades por tanda).
--    · Sus líneas (receta/ingredientes, embalaje, mano de obra) pueden ser
--      "por tanda" o "por unidad vendida".
--    · Los precios se definen por formato y canal (Varejo, Ponto de
--      venda, Kit 4…) y la vista de márgenes calcula lucro, margen y
--      markup, incluido el valor "por cento" (100 unidades).
--
--  Margen = (precio - costo) / precio        Markup = precio / costo
--  (la planilla usaba tres definiciones distintas; aquí es una sola)
-- =====================================================================

begin;

do $$
begin
  if to_regclass('public.companies') is null then
    raise exception 'Ejecuta primero 001_confeitaria_schema.sql';
  end if;
  if to_regclass('public.product_formats') is not null then
    raise exception 'Esta migración ya fue ejecutada.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. TIPOS NUEVOS
-- ---------------------------------------------------------------------
create type public.cost_section as enum ('PRODUCT', 'PACKAGING');
create type public.cost_basis   as enum ('BATCH', 'UNIT');   -- por tanda / por unidad vendida

-- ---------------------------------------------------------------------
-- 2. INGREDIENTES: datos del envase + costo manual + costo efectivo
-- ---------------------------------------------------------------------
alter table public.ingredients
  add column brand               text,
  add column notes               text,
  add column default_supplier_id uuid,
  add column pack_quantity       numeric(16,4) check (pack_quantity > 0),   -- en unidad base (g / ml / un)
  add column pack_price          numeric(14,4) check (pack_price >= 0),
  add column manual_cost         numeric(18,8) check (manual_cost >= 0),    -- por unidad base
  add constraint ingredients_default_supplier_fk
      foreign key (default_supplier_id, company_id) references public.suppliers (id, company_id);

alter table public.ingredients
  add column cost numeric(24,12) generated always as (
    coalesce(
      manual_cost,
      nullif(avg_cost, 0),
      case when pack_quantity > 0 then pack_price / pack_quantity end,
      0)
  ) stored;

alter table public.ingredients
  add column cost_source text generated always as (
    case
      when manual_cost is not null then 'MANUAL'
      when avg_cost > 0 then 'COMPRAS'
      when pack_quantity > 0 and pack_price is not null then 'EMBALAGEM'
      else 'SEM_CUSTO'
    end
  ) stored;

-- ---------------------------------------------------------------------
-- 3. LIMPIEZA DE LO ANTERIOR (vistas y funciones que dependían del rendimiento)
-- ---------------------------------------------------------------------
drop view if exists public.product_price_margins;
drop view if exists public.product_cost_summary;
drop view if exists public.recipe_cost_summary;

drop function if exists public.product_unit_cost(uuid);
drop function if exists public.product_price_for_quantity(uuid, numeric);
drop function if exists public.recipe_unit_cost(uuid);
drop function if exists public.recipe_total_cost(uuid, integer);
drop function if exists public.explode_recipe(uuid, numeric, integer);

-- ---------------------------------------------------------------------
-- 4. RECETAS: sin rendimiento, con secciones y costo manual por línea
-- ---------------------------------------------------------------------
alter table public.recipes
  drop column yield_quantity,
  drop column yield_unit;

alter table public.recipe_items
  add column section     public.cost_section not null default 'PRODUCT',
  add column manual_cost numeric(14,4) check (manual_cost >= 0);   -- total de la línea, por tanda

alter table public.recipe_extra_costs
  add column minutes     numeric(10,2) check (minutes >= 0),
  add column hourly_rate numeric(14,2) check (hourly_rate >= 0),
  add constraint recipe_extra_costs_no_packaging check (type <> 'PACKAGING');

-- ---------------------------------------------------------------------
-- 5. PRODUCTOS: formatos, líneas de costo y precios por formato
-- ---------------------------------------------------------------------
alter table public.products
  drop column recipe_id,
  drop column recipe_quantity,
  drop column packaging_cost,
  drop column other_cost;

create table public.product_formats (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null,
  product_id      uuid not null,
  name            text not null,                                    -- "18g", "13g"
  units_per_batch numeric(14,4) not null check (units_per_batch > 0), -- rendimiento
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  unique (id, company_id),
  unique (product_id, name),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade
);
create index on public.product_formats (product_id);

create table public.product_items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  product_id    uuid not null,
  section       public.cost_section not null default 'PRODUCT',
  basis         public.cost_basis   not null default 'BATCH',
  ingredient_id uuid,
  recipe_id     uuid,
  quantity      numeric(16,4) not null check (quantity > 0),   -- unidad base del ingrediente, o nº de tandas de la receta
  manual_cost   numeric(14,4) check (manual_cost >= 0),        -- total de la línea (en su base: tanda o unidad)
  created_at    timestamptz not null default now(),
  foreign key (product_id, company_id)    references public.products    (id, company_id) on delete cascade,
  foreign key (ingredient_id, company_id) references public.ingredients (id, company_id),
  foreign key (recipe_id, company_id)     references public.recipes     (id, company_id),
  check ((ingredient_id is not null)::int + (recipe_id is not null)::int = 1)
);
create index on public.product_items (product_id);

create table public.product_extra_costs (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  product_id  uuid not null,
  basis       public.cost_basis not null default 'BATCH',
  type        public.extra_cost_type not null default 'LABOR' check (type <> 'PACKAGING'),
  description text,
  minutes     numeric(10,2) check (minutes >= 0),
  hourly_rate numeric(14,2) check (hourly_rate >= 0),
  amount      numeric(14,2) not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  foreign key (product_id, company_id) references public.products (id, company_id) on delete cascade
);
create index on public.product_extra_costs (product_id);

alter table public.product_prices
  add column format_id   uuid,
  add column bundle_size numeric(14,4) not null default 1 check (bundle_size > 0),   -- Kit 4 => 4
  add column auto_quote  boolean not null default true,                              -- ¿se elige solo en cotizaciones?
  add constraint product_prices_format_fk
      foreign key (format_id, company_id) references public.product_formats (id, company_id) on delete cascade;
create unique index product_prices_format_name_uq on public.product_prices (format_id, name) where format_id is not null;

-- Las cotizaciones y pedidos recuerdan el formato vendido
alter table public.quote_items
  add column format_id uuid,
  add constraint quote_items_format_fk
      foreign key (format_id, company_id) references public.product_formats (id, company_id);
alter table public.order_items
  add column format_id uuid,
  add constraint order_items_format_fk
      foreign key (format_id, company_id) references public.product_formats (id, company_id);

-- ---------------------------------------------------------------------
-- 6. CÁLCULO DE COSTOS (Producto / Embalaje / Mano de obra)
-- ---------------------------------------------------------------------

-- Costo de UNA tanda de receta, separado por sección.
create function public.recipe_cost_parts(p_recipe_id uuid, p_depth integer default 0)
returns table (cost_product numeric, cost_packaging numeric, cost_labor numeric)
language plpgsql stable as $$
declare
  v_p numeric := 0;
  v_k numeric := 0;
  v_l numeric := 0;
  r   record;
  s   record;
begin
  if p_depth > 10 then
    raise exception 'RECIPE_TOO_DEEP';
  end if;

  -- líneas de ingredientes (el costo manual de la línea reemplaza al calculado)
  select
    coalesce(sum(case when ri.section = 'PRODUCT'   then coalesce(ri.manual_cost, ri.quantity * i.cost) end), 0),
    coalesce(sum(case when ri.section = 'PACKAGING' then coalesce(ri.manual_cost, ri.quantity * i.cost) end), 0)
  into v_p, v_k
  from public.recipe_items ri
  join public.ingredients i on i.id = ri.ingredient_id
  where ri.recipe_id = p_recipe_id;

  -- líneas que son otra receta (cantidad = tandas)
  for r in
    select ri.quantity as qty, ri.section as sec, ri.manual_cost as mc, ri.sub_recipe_id as sid
    from public.recipe_items ri
    where ri.recipe_id = p_recipe_id and ri.sub_recipe_id is not null
  loop
    if r.mc is not null then
      if r.sec = 'PRODUCT' then v_p := v_p + r.mc; else v_k := v_k + r.mc; end if;
    else
      select * into s from public.recipe_cost_parts(r.sid, p_depth + 1);
      v_p := v_p + r.qty * s.cost_product;
      v_k := v_k + r.qty * s.cost_packaging;
      v_l := v_l + r.qty * s.cost_labor;
    end if;
  end loop;

  -- mano de obra y otros costos de la receta
  v_l := v_l + coalesce(
    (select sum(amount) from public.recipe_extra_costs where recipe_id = p_recipe_id), 0);

  return query select v_p, v_k, v_l;
end $$;

create function public.recipe_total_cost(p_recipe_id uuid) returns numeric
language sql stable as $$
  select cost_product + cost_packaging + cost_labor from public.recipe_cost_parts(p_recipe_id);
$$;

-- Costo de un producto: lo que cuesta una TANDA y lo que cuesta cada UNIDAD vendida
create function public.product_cost_parts(p_product_id uuid)
returns table (
  batch_product numeric, batch_packaging numeric, batch_labor numeric,
  unit_product  numeric, unit_packaging  numeric, unit_labor  numeric)
language plpgsql stable as $$
declare
  r record;
  s record;
  b numeric[] := array[0, 0, 0]::numeric[];    -- por tanda: producto, embalaje, mano de obra
  u numeric[] := array[0, 0, 0]::numeric[];    -- por unidad vendida
  a numeric[];
begin
  for r in
    select pi.basis, pi.section, pi.quantity, pi.manual_cost, pi.recipe_id, coalesce(i.cost, 0) as ing_cost
    from public.product_items pi
    left join public.ingredients i on i.id = pi.ingredient_id
    where pi.product_id = p_product_id
  loop
    if r.recipe_id is not null and r.manual_cost is null then
      select * into s from public.recipe_cost_parts(r.recipe_id);
      a := array[r.quantity * s.cost_product, r.quantity * s.cost_packaging, r.quantity * s.cost_labor]::numeric[];
    else
      a := array[0, 0, 0]::numeric[];
      a[case r.section when 'PRODUCT' then 1 else 2 end] := coalesce(r.manual_cost, r.quantity * r.ing_cost);
    end if;

    if r.basis = 'BATCH' then
      b := array[b[1] + a[1], b[2] + a[2], b[3] + a[3]]::numeric[];
    else
      u := array[u[1] + a[1], u[2] + a[2], u[3] + a[3]]::numeric[];
    end if;
  end loop;

  for r in
    select basis, amount from public.product_extra_costs where product_id = p_product_id
  loop
    if r.basis = 'BATCH' then b[3] := b[3] + r.amount; else u[3] := u[3] + r.amount; end if;
  end loop;

  return query select b[1], b[2], b[3], u[1], u[2], u[3];
end $$;

-- Precio automático para cotizaciones según la cantidad (solo precios "auto_quote" por unidad)
create function public.format_price_for_quantity(p_format_id uuid, p_quantity numeric) returns numeric
language sql stable as $$
  select coalesce(
    (select price from public.product_prices
      where format_id = p_format_id and active and auto_quote and bundle_size = 1
        and minimum_quantity <= p_quantity
      order by minimum_quantity desc, price desc limit 1),
    (select price from public.product_prices
      where format_id = p_format_id and active and auto_quote and bundle_size = 1
      order by minimum_quantity asc, price desc limit 1),
    (select price / bundle_size from public.product_prices
      where format_id = p_format_id and active
      order by minimum_quantity asc, price desc limit 1));
$$;

-- Ingredientes necesarios para N tandas (incluye sub-recetas; cantidad de sub-receta = tandas)
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
    cross join lateral public.explode_recipe(ri.sub_recipe_id, ri.quantity * p_factor, p_depth + 1) e
    where ri.recipe_id = p_recipe_id and ri.sub_recipe_id is not null;
end $$;

-- ---------------------------------------------------------------------
-- 7. VISTAS (security_invoker => respetan RLS)
-- ---------------------------------------------------------------------

create view public.recipe_cost_summary with (security_invoker = true) as
select r.id as recipe_id, r.company_id, r.name, r.active,
       c.cost_product, c.cost_packaging, c.cost_labor,
       c.cost_product + c.cost_packaging + c.cost_labor as total_cost
from public.recipes r
cross join lateral public.recipe_cost_parts(r.id) c;

-- Costo POR UNIDAD VENDIDA de cada formato, separado en tres partes
create view public.product_format_costs with (security_invoker = true) as
select f.id as format_id, f.company_id, f.product_id, p.name as product_name, p.category_id,
       p.active as product_active, f.name as format_name, f.units_per_batch, f.active, f.sort_order,
       c.batch_product   / f.units_per_batch + c.unit_product   as cost_product,
       c.batch_packaging / f.units_per_batch + c.unit_packaging as cost_packaging,
       c.batch_labor     / f.units_per_batch + c.unit_labor     as cost_labor,
       (c.batch_product + c.batch_packaging + c.batch_labor) / f.units_per_batch
         + c.unit_product + c.unit_packaging + c.unit_labor     as cost_total,
       (c.batch_product + c.batch_packaging + c.batch_labor)
         + (c.unit_product + c.unit_packaging + c.unit_labor) * f.units_per_batch as batch_total
from public.product_formats f
join public.products p on p.id = f.product_id
cross join lateral public.product_cost_parts(f.product_id) c;

-- Margen por cada precio (Varejo, Ponto de venda, Kit 4…)
create view public.product_price_margins with (security_invoker = true) as
select pp.id as price_id, pp.company_id, pp.product_id, pp.format_id,
       fc.product_name, fc.category_id, fc.format_name, fc.units_per_batch,
       pp.name as price_name, pp.price, pp.bundle_size, pp.minimum_quantity, pp.active, pp.auto_quote,
       pp.price / pp.bundle_size                                as unit_price,
       fc.cost_total                                            as unit_cost,
       pp.price / pp.bundle_size - fc.cost_total                as profit,
       round((pp.price / pp.bundle_size - fc.cost_total) / (pp.price / pp.bundle_size) * 100, 2) as margin_pct,
       case when fc.cost_total > 0 then round((pp.price / pp.bundle_size) / fc.cost_total, 2) end as markup,
       (pp.price / pp.bundle_size) * 100                        as price_per_100,
       fc.cost_total * 100                                      as cost_per_100,
       (pp.price / pp.bundle_size - fc.cost_total) * fc.units_per_batch as batch_profit
from public.product_prices pp
join public.product_format_costs fc on fc.format_id = pp.format_id;

-- ---------------------------------------------------------------------
-- 8. DUPLICAR UN PRODUCTO (copia formatos, líneas, costos y precios)
-- ---------------------------------------------------------------------
create function public.duplicate_product(p_product_id uuid, p_new_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_p   public.products%rowtype;
  v_new uuid;
  v_fmt uuid;
  f     record;
begin
  select * into v_p from public.products where id = p_product_id;
  if not found or not public.is_company_member(v_p.company_id) then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;
  if coalesce(trim(p_new_name), '') = '' then
    raise exception 'INVALID_NAME';
  end if;

  insert into public.products (company_id, name, description, category_id, sale_unit, active)
  values (v_p.company_id, trim(p_new_name), v_p.description, v_p.category_id, v_p.sale_unit, true)
  returning id into v_new;

  insert into public.product_items (company_id, product_id, section, basis, ingredient_id, recipe_id, quantity, manual_cost)
  select company_id, v_new, section, basis, ingredient_id, recipe_id, quantity, manual_cost
  from public.product_items where product_id = p_product_id;

  insert into public.product_extra_costs (company_id, product_id, basis, type, description, minutes, hourly_rate, amount)
  select company_id, v_new, basis, type, description, minutes, hourly_rate, amount
  from public.product_extra_costs where product_id = p_product_id;

  for f in select * from public.product_formats where product_id = p_product_id order by sort_order, created_at loop
    insert into public.product_formats (company_id, product_id, name, units_per_batch, active, sort_order)
    values (f.company_id, v_new, f.name, f.units_per_batch, f.active, f.sort_order)
    returning id into v_fmt;

    insert into public.product_prices
      (company_id, product_id, format_id, name, price, bundle_size, minimum_quantity, active, auto_quote)
    select company_id, v_new, v_fmt, name, price, bundle_size, minimum_quantity, active, auto_quote
    from public.product_prices where format_id = f.id;
  end loop;

  return v_new;
end $$;

-- ---------------------------------------------------------------------
-- 9. COTIZACIONES: ahora eligen un formato del producto
-- ---------------------------------------------------------------------
--  p_items: [{ "product_id": "...", "format_id": "..." (opcional), "quantity": 100,
--              "unit_price": 2.5 (opcional), "description": "..." (opcional) }
--            | { "description": "Servicio", "quantity": 1, "unit_price": 50, "cost": 20 }]
create or replace function public.save_quote(
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
  v_fmt       public.product_formats%rowtype;
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
    v_fmt   := null;
    if v_qty is null or v_qty <= 0 then
      raise exception 'INVALID_QUANTITY';
    end if;

    if nullif(v_item->>'product_id', '') is not null then
      select * into v_prod from public.products
      where id = (v_item->>'product_id')::uuid and company_id = p_company_id and active;
      if not found then
        raise exception 'INVALID_PRODUCT';
      end if;

      if nullif(v_item->>'format_id', '') is not null then
        select * into v_fmt from public.product_formats
        where id = (v_item->>'format_id')::uuid and product_id = v_prod.id
          and company_id = p_company_id and active;
      else
        select * into v_fmt from public.product_formats
        where product_id = v_prod.id and company_id = p_company_id and active
        order by sort_order, created_at limit 1;
      end if;
      if v_fmt.id is null then
        raise exception 'PRODUCT_WITHOUT_FORMAT: %', v_prod.name;
      end if;
      if not exists (select 1 from public.product_prices where format_id = v_fmt.id and active) then
        raise exception 'PRODUCT_WITHOUT_PRICE: % (%)', v_prod.name, v_fmt.name;
      end if;

      select cost_total into v_cost from public.product_format_costs where format_id = v_fmt.id;
      v_price := coalesce(v_price, public.format_price_for_quantity(v_fmt.id, v_qty));
      v_desc  := coalesce(v_desc,
                   v_prod.name || case when (select count(*) from public.product_formats
                                             where product_id = v_prod.id and active) > 1
                                       then ' (' || v_fmt.name || ')' else '' end);
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
      (company_id, quote_id, product_id, format_id, description, quantity, unit_price, cost_snapshot, total_price)
    values
      (p_company_id, v_quote_id, nullif(v_item->>'product_id', '')::uuid, v_fmt.id, v_desc, v_qty,
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

create or replace function public.approve_quote(p_quote_id uuid) returns uuid
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
    (company_id, order_id, product_id, format_id, description, quantity, unit_price, cost_snapshot, total_price)
  select company_id, v_order_id, product_id, format_id, description, quantity, unit_price, cost_snapshot, total_price
  from public.quote_items where quote_id = v_q.id;

  return v_order_id;
end $$;

-- ---------------------------------------------------------------------
-- 10. SEGURIDAD: RLS y permisos de lo nuevo
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['product_formats', 'product_items', 'product_extra_costs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated
                    using (public.is_company_member(company_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated
                    with check (public.is_company_member(company_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated
                    using (public.is_company_member(company_id))
                    with check (public.is_company_member(company_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated
                    using (public.is_company_member(company_id))', t || '_delete', t);
  end loop;
end $$;

grant select, insert, update, delete
  on public.product_formats, public.product_items, public.product_extra_costs to authenticated;

grant select on public.recipe_cost_summary, public.product_format_costs, public.product_price_margins
  to authenticated;

-- Ingredientes: se pueden editar los datos del envase y el costo manual,
-- pero NUNCA el stock ni el costo medio (los mueven solo las funciones).
grant insert (brand, notes, default_supplier_id, pack_quantity, pack_price, manual_cost)
  on public.ingredients to authenticated;
grant update (brand, notes, default_supplier_id, pack_quantity, pack_price, manual_cost)
  on public.ingredients to authenticated;

grant execute on all functions in schema public to authenticated;
revoke execute on function public.next_company_number(uuid, text) from authenticated;
revoke execute on function public.handle_new_user()               from authenticated;

commit;
