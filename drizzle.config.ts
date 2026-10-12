import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  // Roles (anon, authenticated, service_role) and auth.users already exist on Supabase.
  entities: { roles: { provider: 'supabase' } },
  schemaFilter: ['public'],
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost/reprep' },
  strict: true,
  verbose: true,
});
