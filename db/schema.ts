import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  plan: text('plan', { enum: ['free', 'pro'] }).notNull().default('free'),
  role: text('role', { enum: ['user', 'admin'] }).notNull().default('user'),
  createdAt: integer('created_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull(),
});

export const subscriptions = sqliteTable('subscriptions', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider'),
  customerId: text('customer_id'),
  subscriptionId: text('subscription_id'),
  status: text('status').notNull().default('inactive'),
  currentPeriodEnd: integer('current_period_end'),
  updatedAt: integer('updated_at').notNull(),
});

export const aiUsageCounters = sqliteTable('ai_usage_counters', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),
  used: integer('used').notNull().default(0),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.period] }),
]);

export const aiUsageEvents = sqliteTable('ai_usage_events', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  requestType: text('request_type', { enum: ['text', 'vision'] }).notNull(),
  inputCharacters: integer('input_characters').notNull(),
  outputCharacters: integer('output_characters').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_ai_usage_user_created').on(table.userId, table.createdAt),
]);
