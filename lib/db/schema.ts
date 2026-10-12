// REPrep core schema. Every user-owned table:
//  - carries user_id (defaults to auth.uid(), so inserts under RLS need not pass it)
//  - has RLS enabled with one owner-only policy for `authenticated`
//  - links to its parent through a composite (parent_id, user_id) FK, so a row
//    can never be attached to another user's deal even by a buggy query.
// Migrations are generated from this file (`npm run db:generate`) and are forward-only.

import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { authenticatedRole, authUsers } from 'drizzle-orm/supabase';

const ownerOnly = (table: string) =>
  pgPolicy(`${table}_owner_all`, {
    as: 'permissive',
    for: 'all',
    to: authenticatedRole,
    using: sql`user_id = (select auth.uid())`,
    withCheck: sql`user_id = (select auth.uid())`,
  });

const id = () => uuid('id').primaryKey().defaultRandom();
const userId = () =>
  uuid('user_id')
    .notNull()
    .default(sql`auth.uid()`)
    .references(() => authUsers.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ---------- enums ----------

export const dealStatus = pgEnum('deal_status', [
  'watching',
  'offer_prep',
  'under_contract',
  'closed',
  'terminated',
]);

export const deadlineKind = pgEnum('deadline_kind', [
  'earnest_money',
  'form17_review',
  'inspection',
  'title_review',
  'financing',
  'appraisal',
  'closing',
  'possession',
  'custom',
]);

export const documentType = pgEnum('document_type', [
  'unknown',
  'form17',
  'inspection',
  'title',
  'hoa',
  'other',
]);

export const reviewStatus = pgEnum('review_status', ['queued', 'running', 'done', 'failed']);
export const findingSeverity = pgEnum('finding_severity', ['high', 'medium', 'low', 'info']);

// ---------- deals ----------

export const deals = pgTable(
  'deals',
  {
    id: id(),
    userId: userId(),
    address: text('address').notNull(),
    parcelPin: text('parcel_pin'), // King County 10-digit PIN, when known
    status: dealStatus('status').notNull().default('watching'),
    listPrice: integer('list_price'), // whole dollars
    notes: text('notes'),
    mutualAcceptanceAt: timestamp('mutual_acceptance_at', { withTimezone: true }),
    // Inputs to the deadline engine (lib/deadlines). deal_dates rows are derived from these.
    form17ReceivedOn: date('form17_received_on'),
    closingDate: date('closing_date'),
    possessionDaysAfterClosing: integer('possession_days_after_closing').notNull().default(0),
    periodOverrides: jsonb('period_overrides').$type<Record<string, number | null>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('deals_id_user_unique').on(t.id, t.userId),
    index('deals_user_idx').on(t.userId),
    ownerOnly('deals'),
  ],
).enableRLS();

// ---------- deadlines ----------

export const dealDates = pgTable(
  'deal_dates',
  {
    id: id(),
    userId: userId(),
    dealId: uuid('deal_id').notNull(),
    kind: deadlineKind('kind').notNull(),
    label: text('label').notNull(),
    periodDays: integer('period_days'), // null for fixed calendar dates (e.g. closing)
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    isOverridden: boolean('is_overridden').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ columns: [t.dealId, t.userId], foreignColumns: [deals.id, deals.userId] }).onDelete('cascade'),
    unique('deal_dates_id_user_unique').on(t.id, t.userId),
    index('deal_dates_deal_idx').on(t.dealId),
    index('deal_dates_due_idx').on(t.dueAt),
    // One engine-managed row per kind per deal; custom rows are free-form.
    uniqueIndex('deal_dates_one_per_kind').on(t.dealId, t.kind).where(sql`kind <> 'custom'`),
    ownerOnly('deal_dates'),
  ],
).enableRLS();

// One row per reminder actually delivered. The unique key is what makes the
// hourly n8n job idempotent (docs/jobs-contract.md).
export const reminderSends = pgTable(
  'reminder_sends',
  {
    id: id(),
    userId: userId(),
    dealDateId: uuid('deal_date_id').notNull(),
    offsetKey: text('offset_key').notNull(), // '48h' | '24h' | 'day_of'
    providerMessageId: text('provider_message_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.dealDateId, t.userId], foreignColumns: [dealDates.id, dealDates.userId] }).onDelete(
      'cascade',
    ),
    unique('reminder_sends_once').on(t.dealDateId, t.offsetKey),
    ownerOnly('reminder_sends'),
  ],
).enableRLS();

// ---------- documents + review ----------

export const documents = pgTable(
  'documents',
  {
    id: id(),
    userId: userId(),
    dealId: uuid('deal_id').notNull(),
    storagePath: text('storage_path').notNull(),
    filename: text('filename').notNull(),
    docType: documentType('doc_type').notNull().default('unknown'),
    pageCount: integer('page_count'),
    isScanned: boolean('is_scanned'),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.dealId, t.userId], foreignColumns: [deals.id, deals.userId] }).onDelete('cascade'),
    unique('documents_id_user_unique').on(t.id, t.userId),
    unique('documents_storage_path_unique').on(t.storagePath),
    ownerOnly('documents'),
  ],
).enableRLS();

export const reviewRuns = pgTable(
  'review_runs',
  {
    id: id(),
    userId: userId(),
    documentId: uuid('document_id').notNull(),
    status: reviewStatus('status').notNull().default('queued'),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 4 }).notNull().default('0'),
    findingsDropped: integer('findings_dropped').notNull().default(0),
    pagesReviewed: integer('pages_reviewed').notNull().default(0),
    error: text('error'),
    startedAt: createdAt(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    foreignKey({ columns: [t.documentId, t.userId], foreignColumns: [documents.id, documents.userId] }).onDelete(
      'cascade',
    ),
    unique('review_runs_id_user_unique').on(t.id, t.userId),
    ownerOnly('review_runs'),
  ],
).enableRLS();

export const reviewFindings = pgTable(
  'review_findings',
  {
    id: id(),
    userId: userId(),
    runId: uuid('run_id').notNull(),
    severity: findingSeverity('severity').notNull(),
    category: text('category').notNull(),
    summary: text('summary').notNull(),
    page: integer('page').notNull(),
    quote: text('quote').notNull(),
    // true when the quote was found verbatim (normalized) on the cited page's extracted text;
    // false only for pages with no text layer (scanned), which the UI labels as unverified.
    quoteVerified: boolean('quote_verified').notNull().default(false),
    questionToAsk: text('question_to_ask').notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.runId, t.userId], foreignColumns: [reviewRuns.id, reviewRuns.userId] }).onDelete(
      'cascade',
    ),
    index('review_findings_run_idx').on(t.runId),
    ownerOnly('review_findings'),
  ],
).enableRLS();

// ---------- comps + term sheets ----------

export const compSets = pgTable(
  'comp_sets',
  {
    id: id(),
    userId: userId(),
    dealId: uuid('deal_id').notNull(),
    params: jsonb('params').notNull(),
    results: jsonb('results').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.dealId, t.userId], foreignColumns: [deals.id, deals.userId] }).onDelete('cascade'),
    ownerOnly('comp_sets'),
  ],
).enableRLS();

export const termSheets = pgTable(
  'term_sheets',
  {
    id: id(),
    userId: userId(),
    dealId: uuid('deal_id').notNull(),
    data: jsonb('data').notNull(),
    closingDate: date('closing_date'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ columns: [t.dealId, t.userId], foreignColumns: [deals.id, deals.userId] }).onDelete('cascade'),
    unique('term_sheets_one_per_deal').on(t.dealId),
    ownerOnly('term_sheets'),
  ],
).enableRLS();
