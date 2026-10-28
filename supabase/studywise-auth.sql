-- StudyWise AI: Supabase Auth profile bootstrap.
-- Run this in Supabase SQL Editor after the public.profiles table and RLS policies exist.
-- Public sign-ups always receive the learner role. Elevated roles must be assigned by a trusted administrator.

create or replace function public.handle_new_studywise_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'learner'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_studywise_auth_user_created on auth.users;
create trigger on_studywise_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_studywise_user();

-- Ensure ordinary authenticated users cannot change their own role through the API.
revoke update on public.profiles from authenticated;
revoke delete on public.profiles from authenticated;

-- Read access is limited by the existing policy: auth.uid() = id.
