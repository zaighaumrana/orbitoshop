-- ============================================================================
-- Configurable invoice / ticket numbering
-- ============================================================================
-- invoice_prefix / ticket_prefix: admin-editable short codes (e.g. "INV", "TK")
-- invoice_seq / ticket_seq: last-used sequence number, incremented atomically
-- via the RPC functions below — never touched directly by the app.
-- ============================================================================

alter table public.shop_config
  add column if not exists invoice_prefix text default 'INV',
  add column if not exists invoice_seq    integer default 0,
  add column if not exists ticket_prefix  text default 'TK',
  add column if not exists ticket_seq     integer default 0;

-- Plain POS sales never had a real, stored invoice number — the app was
-- deriving "INV-{id}" on the fly at print time. Give it a real column.
alter table public.sales
  add column if not exists invoice_number text;

-- Atomically returns the next invoice sequence number and persists it.
create or replace function public.next_invoice_seq()
returns integer
language plpgsql
security definer
as $$
declare
  new_seq integer;
begin
  update public.shop_config
  set invoice_seq = invoice_seq + 1
  where id = 1
  returning invoice_seq into new_seq;
  return new_seq;
end;
$$;

-- Atomically returns the next ticket sequence number and persists it.
create or replace function public.next_ticket_seq()
returns integer
language plpgsql
security definer
as $$
declare
  new_seq integer;
begin
  update public.shop_config
  set ticket_seq = ticket_seq + 1
  where id = 1
  returning ticket_seq into new_seq;
  return new_seq;
end;
$$;

-- The app only ever uses the anon key, so both functions must be callable by it.
grant execute on function public.next_invoice_seq() to anon;
grant execute on function public.next_ticket_seq()  to anon;