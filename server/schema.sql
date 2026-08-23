create extension if not exists pgcrypto;

create table if not exists rooms (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null,
  name           text not null,
  owner_name     text,
  password_hash  text,
  listed         boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists rooms_code_idx on rooms(code);

-- Limpeza da versao anterior, que tinha contas com e-mail e senha.
drop table if exists tokens;
drop table if exists users cascade;
alter table rooms drop column if exists owner_id;
alter table rooms add column if not exists owner_name text;
