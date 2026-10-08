-- =====================================================================
--  003 · DADOS DA PLANILHA  (carga inicial a partir do Excel de Michele)
--  Pegar completo en  Supabase > SQL Editor > Run  (UNA sola vez, después de 001 y 002,
--  y después de haber creado tu confitería en la app).
--
--  Carga: proveedores, 25 ingredientes, 7 recetas, 18 productos con sus
--  formatos (18g / 13g), rendimientos, líneas de costo y precios
--  (Varejo, Ponto de venda, Kit 4, Kit 9).
--
--  Se aplica a la confitería MÁS ANTIGUA de la base. Si tienes varias, escribe
--  el nombre exacto abajo (v_nombre) en lugar de NULL.
-- =====================================================================
begin;

create temp table _ctx on commit drop as
select c.id as company_id
from public.companies c
where c.name = coalesce(NULL::text /* <- aquí el nombre exacto, entre comillas simples */, c.name)
order by c.created_at
limit 1;

do $$ begin
  if not exists (select 1 from _ctx) then
    raise exception 'No hay ninguna confitería. Crea la tuya en la app primero.';
  end if;
  if exists (select 1 from public.ingredients i join _ctx on i.company_id = _ctx.company_id) then
    raise exception 'Esta confitería ya tiene ingredientes; la carga inicial ya fue hecha (o hay datos).';
  end if;
end $$;

-- Categorías necesarias
insert into public.ingredient_categories (company_id, name)
select company_id, n from _ctx, unnest(array['Chocolates', 'Embalagens', 'Frutas', 'Laticínios', 'Outros']) n
on conflict (company_id, name) do nothing;
insert into public.product_categories (company_id, name)
select company_id, n from _ctx, unnest(array['Brigadeiro', 'Beijinho', 'Leite Ninho', 'Maracujá', 'Bombom']) n
on conflict (company_id, name) do nothing;

-- Proveedores
insert into public.suppliers (company_id, name)
select company_id, n from _ctx, unnest(array['Olianchi', 'Carrefour', 'Melken', 'Assai', 'Doce Doce']) n;

-- Ingredientes (envase + precio: el costo por unidad = precio / cantidad)
insert into public.ingredients
  (company_id, name, brand, category_id, unit, default_supplier_id, pack_quantity, pack_price, notes)
select c.company_id, v.name, v.brand,
       (select id from public.ingredient_categories k where k.company_id = c.company_id and k.name = v.cat),
       v.unit::public.base_unit,
       (select id from public.suppliers s where s.company_id = c.company_id and s.name = v.sup limit 1),
       v.qty, v.price, v.notes
from _ctx c cross join (values
  ('Chocolate Granulado', 'Melken', 'Chocolates', 'g', 'Olianchi', 400, 42.98, null),
  ('Leite Condensado (8% Gord)', 'Carrefour', 'Laticínios', 'g', 'Carrefour', 395, 5.99, null),
  ('Chocolate Nobre', 'Melken', 'Chocolates', 'g', 'Olianchi', 400, 44.98, null),
  ('Creme de Leite (17% God)', 'Nestlé', 'Laticínios', 'g', 'Carrefour', 200, 3.59, null),
  ('Cacau em Pó', 'Melken', 'Chocolates', 'g', 'Melken', 1000, 43.69, null),
  ('Leite Ninho', 'Nestlé', 'Laticínios', 'g', 'Assai', 380, 24, null),
  ('Coco Ralado Flocado', null, 'Outros', 'g', null, 1000, 48.4, null),
  ('Maracujá', null, 'Frutas', 'g', null, 1000, 13.9, '1 Maracujá = 120g'),
  ('Geléia de Frutas Vermelhas', 'HomeMade', 'Frutas', 'g', null, 320, 29.89, null),
  ('Cobertura Chocolate Branco', 'Genuine', 'Chocolates', 'g', 'Olianchi', 2000, 67.35, null),
  ('Chocolate Branco Nobre', 'Melken', 'Chocolates', 'g', 'Olianchi', 1000, 71.24, null),
  ('Creme de Avelã', 'Nutella', 'Chocolates', 'g', 'Olianchi', 650, 54, null),
  ('Corante Gel', 'BCO', 'Outros', 'g', 'Olianchi', 60, 9.98, null),
  ('Forma Doce Quadrada N°7', 'MAGIA', 'Embalagens', 'unit', 'Olianchi', 50, 2.98, null),
  ('Massa Elastica', null, 'Outros', 'g', 'Olianchi', 500, 27.98, null),
  ('Embalagem Individual (Bolha)', null, 'Embalagens', 'unit', 'Doce Doce', 500, 94, null),
  ('Forma Doce N°5', 'MAGIA', 'Embalagens', 'unit', 'Olianchi', 100, 2.98, null),
  ('Limão', null, 'Frutas', 'g', null, 1000, 5, null),
  ('Adesivo embalagem Bolha', null, 'Embalagens', 'unit', null, 1, 0.3, null),
  ('Pasta Saborizante Pistache', 'MAGO', 'Outros', 'g', 'Olianchi', 90, 34.77, null),
  ('Queijo Parmesão', 'Scala', 'Laticínios', 'g', null, 50, 4.69, null),
  ('Goiabada', null, 'Frutas', 'g', null, 300, 5.69, null),
  ('Uva Verde', null, 'Frutas', 'g', null, 500, 19, null),
  ('Pistache', null, 'Outros', 'g', null, 1000, 299, null),
  ('Nutella', null, 'Chocolates', 'g', null, 140, 19, null)
) as v(name, brand, cat, unit, sup, qty, price, notes);

-- Recetas (sin rendimiento: una receta = el costo de una tanda)
insert into public.recipes (company_id, name)
select company_id, n from _ctx, unnest(array['Brigadeiro Tradicional', 'Leite Ninho', 'Beijinho', 'Maracujá', 'Bombom Chocolate Branco', 'Brigadeiro Pistache', 'Parmesão c/ Goiabada']) n;

insert into public.recipe_items (company_id, recipe_id, ingredient_id, quantity, section)
select c.company_id, r.id, i.id, v.qty, 'PRODUCT'
from _ctx c
cross join (values
  ('Brigadeiro Tradicional', 'Leite Condensado (8% Gord)', 395),
  ('Brigadeiro Tradicional', 'Creme de Leite (17% God)', 200),
  ('Brigadeiro Tradicional', 'Chocolate Nobre', 100),
  ('Brigadeiro Tradicional', 'Cacau em Pó', 40),
  ('Leite Ninho', 'Leite Condensado (8% Gord)', 395),
  ('Leite Ninho', 'Creme de Leite (17% God)', 200),
  ('Leite Ninho', 'Leite Ninho', 40),
  ('Beijinho', 'Leite Condensado (8% Gord)', 395),
  ('Beijinho', 'Creme de Leite (17% God)', 200),
  ('Beijinho', 'Coco Ralado Flocado', 200),
  ('Maracujá', 'Leite Condensado (8% Gord)', 395),
  ('Maracujá', 'Creme de Leite (17% God)', 200),
  ('Maracujá', 'Maracujá', 100),
  ('Bombom Chocolate Branco', 'Cobertura Chocolate Branco', 500),
  ('Brigadeiro Pistache', 'Leite Condensado (8% Gord)', 395),
  ('Brigadeiro Pistache', 'Creme de Leite (17% God)', 200),
  ('Brigadeiro Pistache', 'Pasta Saborizante Pistache', 15),
  ('Brigadeiro Pistache', 'Pistache', 15),
  ('Brigadeiro Pistache', 'Chocolate Branco Nobre', 50),
  ('Parmesão c/ Goiabada', 'Leite Condensado (8% Gord)', 395),
  ('Parmesão c/ Goiabada', 'Creme de Leite (17% God)', 200),
  ('Parmesão c/ Goiabada', 'Queijo Parmesão', 50)
) as v(recipe, ingredient, qty)
join public.recipes r     on r.company_id = c.company_id and r.name = v.recipe
join public.ingredients i on i.company_id = c.company_id and i.name = v.ingredient;

-- Productos por familia
insert into public.products (company_id, name, category_id, sale_unit)
select c.company_id, v.name,
       (select id from public.product_categories k where k.company_id = c.company_id and k.name = v.fam), 'un'
from _ctx c cross join (values
  ('Brigadeiro Tradicional', 'Brigadeiro'),
  ('Brigadeiro Decorado', 'Brigadeiro'),
  ('Brigadeiro Dourado', 'Brigadeiro'),
  ('Brigadeiro Pistache', 'Brigadeiro'),
  ('Parmesão c/ Goiabada', 'Brigadeiro'),
  ('Beijinho Tradicional', 'Beijinho'),
  ('Beijinho Decorado', 'Beijinho'),
  ('Leite Ninho Tradicional', 'Leite Ninho'),
  ('Leite Ninho Decorado', 'Leite Ninho'),
  ('Leite Ninho c/ Nutella', 'Leite Ninho'),
  ('Maracujá Tradicional', 'Maracujá'),
  ('Maracujá Trufado', 'Maracujá'),
  ('Bombom Frutas Vermelhas', 'Bombom'),
  ('Bombom Frutas Vermelhas Decorado', 'Bombom'),
  ('Bombom Limão Siciliano', 'Bombom'),
  ('Bombom Limão Siciliano Decorado', 'Bombom'),
  ('Bombom Maracujá', 'Bombom'),
  ('Bombom Maracujá Decorado', 'Bombom')
) as v(name, fam);

-- Formatos y rendimiento (unidades por tanda)
insert into public.product_formats (company_id, product_id, name, units_per_batch, sort_order)
select c.company_id, p.id, v.fmt, v.yield, v.ord
from _ctx c cross join (values
  ('Brigadeiro Tradicional', '18g', 25, 1),
  ('Brigadeiro Tradicional', '13g', 30, 2),
  ('Brigadeiro Decorado', '18g', 25, 1),
  ('Brigadeiro Decorado', '13g', 30, 2),
  ('Brigadeiro Dourado', '18g', 25, 1),
  ('Brigadeiro Dourado', '13g', 30, 2),
  ('Brigadeiro Pistache', '18g', 25, 1),
  ('Brigadeiro Pistache', '13g', 30, 2),
  ('Parmesão c/ Goiabada', '18g', 25, 1),
  ('Parmesão c/ Goiabada', '13g', 30, 2),
  ('Beijinho Tradicional', '18g', 25, 1),
  ('Beijinho Tradicional', '13g', 30, 2),
  ('Beijinho Decorado', '18g', 25, 1),
  ('Beijinho Decorado', '13g', 30, 2),
  ('Leite Ninho Tradicional', '18g', 25, 1),
  ('Leite Ninho Tradicional', '13g', 30, 2),
  ('Leite Ninho Decorado', '18g', 25, 1),
  ('Leite Ninho Decorado', '13g', 30, 2),
  ('Leite Ninho c/ Nutella', '18g', 25, 1),
  ('Leite Ninho c/ Nutella', '13g', 30, 2),
  ('Maracujá Tradicional', '18g', 25, 1),
  ('Maracujá Tradicional', '13g', 30, 2),
  ('Maracujá Trufado', '18g', 25, 1),
  ('Maracujá Trufado', '13g', 30, 2),
  ('Bombom Frutas Vermelhas', '18g', 30, 1),
  ('Bombom Frutas Vermelhas Decorado', '18g', 30, 1),
  ('Bombom Limão Siciliano', '18g', 30, 1),
  ('Bombom Limão Siciliano Decorado', '18g', 30, 1),
  ('Bombom Maracujá', '18g', 30, 1),
  ('Bombom Maracujá Decorado', '18g', 30, 1)
) as v(product, fmt, yield, ord)
join public.products p on p.company_id = c.company_id and p.name = v.product;

-- Líneas de costo de cada producto (receta / ingredientes / embalaje)
insert into public.product_items (company_id, product_id, recipe_id, quantity, section, basis)
select c.company_id, p.id, r.id, v.qty, v.sec::public.cost_section, v.basis::public.cost_basis
from _ctx c cross join (values
  ('Brigadeiro Tradicional', 'Brigadeiro Tradicional', 1, 'PRODUCT', 'BATCH'),
  ('Brigadeiro Decorado', 'Brigadeiro Tradicional', 1, 'PRODUCT', 'BATCH'),
  ('Brigadeiro Dourado', 'Brigadeiro Tradicional', 1, 'PRODUCT', 'BATCH'),
  ('Brigadeiro Pistache', 'Brigadeiro Pistache', 1, 'PRODUCT', 'BATCH'),
  ('Parmesão c/ Goiabada', 'Parmesão c/ Goiabada', 1, 'PRODUCT', 'BATCH'),
  ('Beijinho Tradicional', 'Beijinho', 1, 'PRODUCT', 'BATCH'),
  ('Beijinho Decorado', 'Beijinho', 1, 'PRODUCT', 'BATCH'),
  ('Leite Ninho Tradicional', 'Leite Ninho', 1, 'PRODUCT', 'BATCH'),
  ('Leite Ninho Decorado', 'Leite Ninho', 1, 'PRODUCT', 'BATCH'),
  ('Leite Ninho c/ Nutella', 'Leite Ninho', 1, 'PRODUCT', 'BATCH'),
  ('Maracujá Tradicional', 'Maracujá', 1, 'PRODUCT', 'BATCH'),
  ('Maracujá Trufado', 'Leite Ninho', 1, 'PRODUCT', 'BATCH'),
  ('Maracujá Trufado', 'Brigadeiro Tradicional', 0.5, 'PRODUCT', 'BATCH'),
  ('Bombom Frutas Vermelhas', 'Bombom Chocolate Branco', 1, 'PRODUCT', 'BATCH'),
  ('Bombom Frutas Vermelhas Decorado', 'Bombom Chocolate Branco', 1, 'PRODUCT', 'BATCH'),
  ('Bombom Limão Siciliano', 'Bombom Chocolate Branco', 1, 'PRODUCT', 'BATCH'),
  ('Bombom Limão Siciliano Decorado', 'Bombom Chocolate Branco', 1, 'PRODUCT', 'BATCH'),
  ('Bombom Maracujá', 'Bombom Chocolate Branco', 1, 'PRODUCT', 'BATCH'),
  ('Bombom Maracujá Decorado', 'Bombom Chocolate Branco', 1, 'PRODUCT', 'BATCH')
) as v(product, recipe, qty, sec, basis)
join public.products p on p.company_id = c.company_id and p.name = v.product
join public.recipes r  on r.company_id = c.company_id and r.name = v.recipe;

insert into public.product_items (company_id, product_id, ingredient_id, quantity, section, basis)
select c.company_id, p.id, i.id, v.qty, v.sec::public.cost_section, v.basis::public.cost_basis
from _ctx c cross join (values
  ('Brigadeiro Tradicional', 'Chocolate Granulado', 50, 'PRODUCT', 'BATCH'),
  ('Brigadeiro Tradicional', 'Forma Doce N°5', 1, 'PACKAGING', 'UNIT'),
  ('Brigadeiro Tradicional', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Brigadeiro Decorado', 'Chocolate Granulado', 50, 'PRODUCT', 'BATCH'),
  ('Brigadeiro Decorado', 'Forma Doce N°5', 1, 'PACKAGING', 'UNIT'),
  ('Brigadeiro Decorado', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Brigadeiro Decorado', 'Massa Elastica', 250, 'PRODUCT', 'BATCH'),
  ('Brigadeiro Dourado', 'Chocolate Granulado', 50, 'PRODUCT', 'BATCH'),
  ('Brigadeiro Dourado', 'Forma Doce N°5', 1, 'PACKAGING', 'UNIT'),
  ('Brigadeiro Dourado', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Brigadeiro Pistache', 'Pistache', 100, 'PRODUCT', 'BATCH'),
  ('Brigadeiro Pistache', 'Forma Doce N°5', 1, 'PACKAGING', 'UNIT'),
  ('Brigadeiro Pistache', 'Embalagem Individual (Bolha)', 1, 'PACKAGING', 'UNIT'),
  ('Parmesão c/ Goiabada', 'Goiabada', 75, 'PRODUCT', 'BATCH'),
  ('Parmesão c/ Goiabada', 'Forma Doce N°5', 1, 'PACKAGING', 'UNIT'),
  ('Parmesão c/ Goiabada', 'Embalagem Individual (Bolha)', 1, 'PACKAGING', 'UNIT'),
  ('Beijinho Tradicional', 'Coco Ralado Flocado', 200, 'PRODUCT', 'BATCH'),
  ('Beijinho Tradicional', 'Forma Doce N°5', 1, 'PACKAGING', 'UNIT'),
  ('Beijinho Tradicional', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Beijinho Decorado', 'Coco Ralado Flocado', 200, 'PRODUCT', 'BATCH'),
  ('Beijinho Decorado', 'Forma Doce N°5', 1, 'PACKAGING', 'UNIT'),
  ('Beijinho Decorado', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Beijinho Decorado', 'Massa Elastica', 250, 'PRODUCT', 'BATCH'),
  ('Leite Ninho Tradicional', 'Forma Doce N°5', 1, 'PACKAGING', 'UNIT'),
  ('Leite Ninho Tradicional', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Leite Ninho Decorado', 'Forma Doce N°5', 1, 'PACKAGING', 'UNIT'),
  ('Leite Ninho Decorado', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Leite Ninho Decorado', 'Massa Elastica', 250, 'PRODUCT', 'BATCH'),
  ('Leite Ninho c/ Nutella', 'Forma Doce N°5', 1, 'PACKAGING', 'UNIT'),
  ('Leite Ninho c/ Nutella', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Leite Ninho c/ Nutella', 'Nutella', 120, 'PRODUCT', 'BATCH'),
  ('Maracujá Tradicional', 'Forma Doce N°5', 1, 'PACKAGING', 'UNIT'),
  ('Maracujá Tradicional', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Maracujá Trufado', 'Forma Doce N°5', 1, 'PACKAGING', 'UNIT'),
  ('Maracujá Trufado', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Maracujá Trufado', 'Massa Elastica', 250, 'PRODUCT', 'BATCH'),
  ('Bombom Frutas Vermelhas', 'Geléia de Frutas Vermelhas', 180, 'PRODUCT', 'BATCH'),
  ('Bombom Frutas Vermelhas', 'Adesivo embalagem Bolha', 2, 'PACKAGING', 'BATCH'),
  ('Bombom Frutas Vermelhas', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Bombom Frutas Vermelhas', 'Embalagem Individual (Bolha)', 1, 'PACKAGING', 'UNIT'),
  ('Bombom Frutas Vermelhas Decorado', 'Geléia de Frutas Vermelhas', 180, 'PRODUCT', 'BATCH'),
  ('Bombom Frutas Vermelhas Decorado', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Bombom Frutas Vermelhas Decorado', 'Massa Elastica', 250, 'PRODUCT', 'BATCH'),
  ('Bombom Limão Siciliano', 'Limão', 100, 'PRODUCT', 'BATCH'),
  ('Bombom Limão Siciliano', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Bombom Limão Siciliano Decorado', 'Limão', 100, 'PRODUCT', 'BATCH'),
  ('Bombom Limão Siciliano Decorado', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Bombom Limão Siciliano Decorado', 'Massa Elastica', 250, 'PRODUCT', 'BATCH'),
  ('Bombom Maracujá', 'Maracujá', 300, 'PRODUCT', 'BATCH'),
  ('Bombom Maracujá', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Bombom Maracujá Decorado', 'Maracujá', 300, 'PRODUCT', 'BATCH'),
  ('Bombom Maracujá Decorado', 'Forma Doce Quadrada N°7', 1, 'PACKAGING', 'UNIT'),
  ('Bombom Maracujá Decorado', 'Massa Elastica', 250, 'PRODUCT', 'BATCH')
) as v(product, ingredient, qty, sec, basis)
join public.products p    on p.company_id = c.company_id and p.name = v.product
join public.ingredients i on i.company_id = c.company_id and i.name = v.ingredient;

-- Precios por formato y canal
insert into public.product_prices (company_id, product_id, format_id, name, price, bundle_size, minimum_quantity, auto_quote)
select c.company_id, p.id, f.id, v.pname, v.price, v.bundle, v.minq, v.auto
from _ctx c cross join (values
  ('Brigadeiro Tradicional', '18g', 'Varejo', 4, 1, 1, true),
  ('Brigadeiro Tradicional', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Brigadeiro Tradicional', '18g', 'Kit 4', 15, 4, 4, false),
  ('Brigadeiro Tradicional', '18g', 'Kit 9', 30, 9, 9, false),
  ('Brigadeiro Tradicional', '13g', 'Varejo', 2.8, 1, 1, true),
  ('Brigadeiro Decorado', '18g', 'Varejo', 4.5, 1, 1, true),
  ('Brigadeiro Decorado', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Brigadeiro Decorado', '18g', 'Kit 4', 15, 4, 4, false),
  ('Brigadeiro Decorado', '18g', 'Kit 9', 30, 9, 9, false),
  ('Brigadeiro Decorado', '13g', 'Varejo', 3, 1, 1, true),
  ('Brigadeiro Dourado', '18g', 'Varejo', 4, 1, 1, true),
  ('Brigadeiro Dourado', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Brigadeiro Dourado', '18g', 'Kit 4', 15, 4, 4, false),
  ('Brigadeiro Dourado', '18g', 'Kit 9', 30, 9, 9, false),
  ('Brigadeiro Dourado', '13g', 'Varejo', 3, 1, 1, true),
  ('Brigadeiro Pistache', '18g', 'Varejo', 6, 1, 1, true),
  ('Brigadeiro Pistache', '18g', 'Ponto de venda', 4.5, 1, 1, false),
  ('Brigadeiro Pistache', '18g', 'Kit 4', 15, 4, 4, false),
  ('Brigadeiro Pistache', '18g', 'Kit 9', 30, 9, 9, false),
  ('Brigadeiro Pistache', '13g', 'Varejo', 5, 1, 1, true),
  ('Parmesão c/ Goiabada', '18g', 'Varejo', 2.8, 1, 1, true),
  ('Parmesão c/ Goiabada', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Parmesão c/ Goiabada', '18g', 'Kit 4', 15, 4, 4, false),
  ('Parmesão c/ Goiabada', '18g', 'Kit 9', 30, 9, 9, false),
  ('Parmesão c/ Goiabada', '13g', 'Varejo', 2.2, 1, 1, true),
  ('Beijinho Tradicional', '18g', 'Varejo', 3, 1, 1, true),
  ('Beijinho Tradicional', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Beijinho Tradicional', '18g', 'Kit 4', 15, 4, 4, false),
  ('Beijinho Tradicional', '18g', 'Kit 9', 30, 9, 9, false),
  ('Beijinho Tradicional', '13g', 'Varejo', 2.5, 1, 1, true),
  ('Beijinho Decorado', '18g', 'Varejo', 3.8, 1, 1, true),
  ('Beijinho Decorado', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Beijinho Decorado', '18g', 'Kit 4', 15, 4, 4, false),
  ('Beijinho Decorado', '18g', 'Kit 9', 30, 9, 9, false),
  ('Beijinho Decorado', '13g', 'Varejo', 3, 1, 1, true),
  ('Leite Ninho Tradicional', '18g', 'Varejo', 2.3, 1, 1, true),
  ('Leite Ninho Tradicional', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Leite Ninho Tradicional', '18g', 'Kit 4', 15, 4, 4, false),
  ('Leite Ninho Tradicional', '18g', 'Kit 9', 30, 9, 9, false),
  ('Leite Ninho Tradicional', '13g', 'Varejo', 1.9, 1, 1, true),
  ('Leite Ninho Decorado', '18g', 'Varejo', 2.8, 1, 1, true),
  ('Leite Ninho Decorado', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Leite Ninho Decorado', '18g', 'Kit 4', 15, 4, 4, false),
  ('Leite Ninho Decorado', '18g', 'Kit 9', 30, 9, 9, false),
  ('Leite Ninho Decorado', '13g', 'Varejo', 2.1, 1, 1, true),
  ('Leite Ninho c/ Nutella', '18g', 'Varejo', 2.8, 1, 1, true),
  ('Leite Ninho c/ Nutella', '13g', 'Varejo', 2.5, 1, 1, true),
  ('Maracujá Tradicional', '18g', 'Varejo', 2.2, 1, 1, true),
  ('Maracujá Tradicional', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Maracujá Tradicional', '18g', 'Kit 4', 15, 4, 4, false),
  ('Maracujá Tradicional', '18g', 'Kit 9', 30, 9, 9, false),
  ('Maracujá Tradicional', '13g', 'Varejo', 1.8, 1, 1, true),
  ('Maracujá Trufado', '18g', 'Varejo', 2.9, 1, 1, true),
  ('Maracujá Trufado', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Maracujá Trufado', '18g', 'Kit 4', 15, 4, 4, false),
  ('Maracujá Trufado', '18g', 'Kit 9', 30, 9, 9, false),
  ('Maracujá Trufado', '13g', 'Varejo', 2.4, 1, 1, true),
  ('Bombom Frutas Vermelhas', '18g', 'Varejo', 3, 1, 1, true),
  ('Bombom Frutas Vermelhas', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Bombom Frutas Vermelhas', '18g', 'Kit 4', 15, 4, 4, false),
  ('Bombom Frutas Vermelhas', '18g', 'Kit 9', 30, 9, 9, false),
  ('Bombom Frutas Vermelhas Decorado', '18g', 'Varejo', 3, 1, 1, true),
  ('Bombom Frutas Vermelhas Decorado', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Bombom Frutas Vermelhas Decorado', '18g', 'Kit 4', 15, 4, 4, false),
  ('Bombom Frutas Vermelhas Decorado', '18g', 'Kit 9', 30, 9, 9, false),
  ('Bombom Limão Siciliano', '18g', 'Varejo', 2.3, 1, 1, true),
  ('Bombom Limão Siciliano', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Bombom Limão Siciliano', '18g', 'Kit 4', 15, 4, 4, false),
  ('Bombom Limão Siciliano', '18g', 'Kit 9', 30, 9, 9, false),
  ('Bombom Limão Siciliano Decorado', '18g', 'Varejo', 2.8, 1, 1, true),
  ('Bombom Limão Siciliano Decorado', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Bombom Limão Siciliano Decorado', '18g', 'Kit 4', 15, 4, 4, false),
  ('Bombom Limão Siciliano Decorado', '18g', 'Kit 9', 30, 9, 9, false),
  ('Bombom Maracujá', '18g', 'Varejo', 2.3, 1, 1, true),
  ('Bombom Maracujá', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Bombom Maracujá', '18g', 'Kit 4', 15, 4, 4, false),
  ('Bombom Maracujá', '18g', 'Kit 9', 30, 9, 9, false),
  ('Bombom Maracujá Decorado', '18g', 'Varejo', 2.8, 1, 1, true),
  ('Bombom Maracujá Decorado', '18g', 'Ponto de venda', 3.5, 1, 1, false),
  ('Bombom Maracujá Decorado', '18g', 'Kit 4', 15, 4, 4, false),
  ('Bombom Maracujá Decorado', '18g', 'Kit 9', 30, 9, 9, false)
) as v(product, fmt, pname, price, bundle, minq, auto)
join public.products p        on p.company_id = c.company_id and p.name = v.product
join public.product_formats f on f.product_id = p.id and f.name = v.fmt;

-- Control: si algún nombre no coincidió, se cancela todo en vez de cargar a medias
do $$
declare n int;
begin
  select count(*) into n from public.ingredients    i join _ctx c on c.company_id = i.company_id;  if n <> 25 then raise exception 'ingredientes: % de 25', n; end if;
  select count(*) into n from public.recipes        i join _ctx c on c.company_id = i.company_id;  if n <> 7 then raise exception 'recetas: % de 7', n; end if;
  select count(*) into n from public.recipe_items   i join _ctx c on c.company_id = i.company_id;  if n <> 22 then raise exception 'líneas de receta: % de 22', n; end if;
  select count(*) into n from public.products       i join _ctx c on c.company_id = i.company_id;  if n <> 18 then raise exception 'productos: % de 18', n; end if;
  select count(*) into n from public.product_formats i join _ctx c on c.company_id = i.company_id; if n <> 30 then raise exception 'formatos: % de 30', n; end if;
  select count(*) into n from public.product_items  i join _ctx c on c.company_id = i.company_id;  if n <> 72 then raise exception 'líneas de producto: % de 72', n; end if;
  select count(*) into n from public.product_prices i join _ctx c on c.company_id = i.company_id;  if n <> 81 then raise exception 'precios: % de 81', n; end if;
end $$;

commit;
