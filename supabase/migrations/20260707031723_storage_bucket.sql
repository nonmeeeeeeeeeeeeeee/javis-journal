-- Javi's Journal -- private image storage bucket

insert into storage.buckets (id, name, public)
values ('images', 'images', false)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'images_select_own_folder'
  ) then
    create policy images_select_own_folder on storage.objects
      for select to authenticated
      using (
        bucket_id = 'images'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'images_insert_own_folder'
  ) then
    create policy images_insert_own_folder on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'images'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'images_update_own_folder'
  ) then
    create policy images_update_own_folder on storage.objects
      for update to authenticated
      using (
        bucket_id = 'images'
        and auth.uid()::text = (storage.foldername(name))[1]
      )
      with check (
        bucket_id = 'images'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'images_delete_own_folder'
  ) then
    create policy images_delete_own_folder on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'images'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end;
$$;
