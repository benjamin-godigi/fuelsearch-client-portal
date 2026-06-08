drop trigger if exists on_auth_user_created_create_profile on auth.users;

drop function if exists public.handle_new_user_profile();

alter table public.profiles
  alter column is_active set default true;

alter table public.profiles
  alter column must_change_password set default false;

alter table public.clients
  alter column is_active set default true;

update public.profiles
set is_active = true,
    updated_at = now()
where is_active is distinct from true;

update public.clients c
set is_active = true,
    updated_at = now()
from public.profiles p
where p.client_id = c.id
  and p.role = 'customer'
  and c.is_active is distinct from true;
