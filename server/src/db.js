import pg from 'pg'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL nao definida. Copie server/.env.example para server/.env.')
  process.exit(1)
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 8,
  idleTimeoutMillis: 30_000
})

export const q = (text, params) => pool.query(text, params)

export async function migrate() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const sql = await readFile(path.join(here, '..', 'schema.sql'), 'utf8')
  await pool.query(sql)
  console.log('[db] schema aplicado')
}
