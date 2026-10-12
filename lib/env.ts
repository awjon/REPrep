import 'server-only';
import { z } from 'zod';

// Validated lazily per group so `next build` and unrelated routes don't need every secret.

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');

const authSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  FEATURE_PUBLIC_SIGNUP: bool,
  // Comma-separated. While public signup is off, only these addresses can request a link.
  ALLOWED_EMAILS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
});

const jobsSchema = z.object({ JOBS_TOKEN: z.string().min(32) });

const emailSchema = z.object({
  RESEND_API_KEY: z.string().min(10),
  EMAIL_FROM: z.string().min(3), // e.g. "REPrep <reminders@yourdomain>"
  APP_URL: z.string().url(),
});

const reviewSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(10),
  MODEL_REVIEW: z.string().min(3),
  MODEL_TRIAGE: z.string().min(3),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
});

function load<T extends z.ZodTypeAny>(schema: T, name: string): z.infer<T> {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Missing or invalid ${name} env: ${missing}`);
  }
  return parsed.data;
}

export const authEnv = () => load(authSchema, 'auth');
export const jobsEnv = () => load(jobsSchema, 'jobs');
export const emailEnv = () => load(emailSchema, 'email');
export const reviewEnv = () => load(reviewSchema, 'review');

export function isAuthConfigured(): boolean {
  return authSchema.safeParse(process.env).success;
}
