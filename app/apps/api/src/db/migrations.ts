import { Kysely, Migration, MigrationProvider, Migrator } from 'kysely';

const ID = 'varchar(36)';
const TS = 'varchar(32)';

const migrations: Record<string, Migration> = {
  '0001_init': {
    async up(db: Kysely<any>) {
      await db.schema
        .createTable('users')
        .addColumn('id', ID, (c) => c.primaryKey())
        .addColumn('email', 'varchar(255)', (c) => c.unique())
        .addColumn('phone', 'varchar(32)', (c) => c.unique())
        .addColumn('name', 'varchar(255)', (c) => c.notNull())
        .addColumn('password_hash', 'varchar(255)', (c) => c.notNull())
        .addColumn('is_admin', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('is_blocked', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('timezone', 'varchar(64)', (c) => c.notNull().defaultTo('Europe/Moscow'))
        .addColumn('created_at', TS, (c) => c.notNull())
        .addColumn('updated_at', TS, (c) => c.notNull())
        .execute();

      await db.schema
        .createTable('refresh_tokens')
        .addColumn('id', ID, (c) => c.primaryKey())
        .addColumn('user_id', ID, (c) => c.notNull())
        .addColumn('token_hash', 'varchar(64)', (c) => c.notNull().unique())
        .addColumn('device_name', 'varchar(100)')
        .addColumn('expires_at', TS, (c) => c.notNull())
        .addColumn('created_at', TS, (c) => c.notNull())
        .addColumn('revoked_at', TS)
        .execute();
      await db.schema.createIndex('idx_refresh_user').on('refresh_tokens').column('user_id').execute();

      await db.schema
        .createTable('settings')
        .addColumn('name', 'varchar(64)', (c) => c.primaryKey())
        .addColumn('value', 'text', (c) => c.notNull())
        .execute();

      await db.schema
        .createTable('invites')
        .addColumn('id', ID, (c) => c.primaryKey())
        .addColumn('code', 'varchar(64)', (c) => c.notNull().unique())
        .addColumn('created_by', ID, (c) => c.notNull())
        .addColumn('expires_at', TS)
        .addColumn('used_by', ID)
        .addColumn('used_at', TS)
        .addColumn('created_at', TS, (c) => c.notNull())
        .execute();

      await db.schema
        .createTable('budgets')
        .addColumn('id', ID, (c) => c.primaryKey())
        .addColumn('name', 'varchar(100)', (c) => c.notNull())
        .addColumn('type', 'varchar(16)', (c) => c.notNull())
        .addColumn('currency', 'varchar(3)', (c) => c.notNull().defaultTo('RUB'))
        .addColumn('created_by', ID, (c) => c.notNull())
        .addColumn('created_at', TS, (c) => c.notNull())
        .addColumn('updated_at', TS, (c) => c.notNull())
        .addColumn('deleted_at', TS)
        .execute();

      await db.schema
        .createTable('budget_members')
        .addColumn('budget_id', ID, (c) => c.notNull())
        .addColumn('user_id', ID, (c) => c.notNull())
        .addColumn('role', 'varchar(16)', (c) => c.notNull())
        .addColumn('joined_at', TS, (c) => c.notNull())
        .addPrimaryKeyConstraint('pk_budget_members', ['budget_id', 'user_id'])
        .execute();
      await db.schema.createIndex('idx_members_user').on('budget_members').column('user_id').execute();

      await db.schema
        .createTable('budget_invites')
        .addColumn('id', ID, (c) => c.primaryKey())
        .addColumn('budget_id', ID, (c) => c.notNull())
        .addColumn('code', 'varchar(64)', (c) => c.notNull().unique())
        .addColumn('role', 'varchar(16)', (c) => c.notNull())
        .addColumn('created_by', ID, (c) => c.notNull())
        .addColumn('expires_at', TS)
        .addColumn('used_by', ID)
        .addColumn('created_at', TS, (c) => c.notNull())
        .execute();

      await db.schema
        .createTable('accounts')
        .addColumn('id', ID, (c) => c.primaryKey())
        .addColumn('budget_id', ID, (c) => c.notNull())
        .addColumn('name', 'varchar(100)', (c) => c.notNull())
        .addColumn('kind', 'varchar(16)', (c) => c.notNull())
        .addColumn('is_frozen', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('parent_account_id', ID)
        .addColumn('bank_name', 'varchar(100)')
        .addColumn('color', 'varchar(16)')
        .addColumn('icon', 'varchar(32)')
        .addColumn('sort', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('is_archived', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('note', 'text')
        .addColumn('created_at', TS, (c) => c.notNull())
        .addColumn('updated_at', TS, (c) => c.notNull())
        .addColumn('deleted_at', TS)
        .execute();
      await db.schema.createIndex('idx_accounts_budget').on('accounts').column('budget_id').execute();

      await db.schema
        .createTable('categories')
        .addColumn('id', ID, (c) => c.primaryKey())
        .addColumn('budget_id', ID, (c) => c.notNull())
        .addColumn('parent_id', ID)
        .addColumn('type', 'varchar(16)', (c) => c.notNull())
        .addColumn('name', 'varchar(100)', (c) => c.notNull())
        .addColumn('color', 'varchar(16)')
        .addColumn('icon', 'varchar(32)')
        .addColumn('sort', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('is_archived', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('created_at', TS, (c) => c.notNull())
        .addColumn('updated_at', TS, (c) => c.notNull())
        .addColumn('deleted_at', TS)
        .execute();
      await db.schema.createIndex('idx_categories_budget').on('categories').column('budget_id').execute();

      await db.schema
        .createTable('transactions')
        .addColumn('id', ID, (c) => c.primaryKey())
        .addColumn('budget_id', ID, (c) => c.notNull())
        .addColumn('type', 'varchar(16)', (c) => c.notNull())
        .addColumn('amount', 'bigint', (c) => c.notNull())
        .addColumn('date', 'varchar(10)', (c) => c.notNull())
        .addColumn('time', 'varchar(5)')
        .addColumn('account_id', ID, (c) => c.notNull())
        .addColumn('to_account_id', ID)
        .addColumn('category_id', ID)
        .addColumn('comment', 'text')
        .addColumn('created_by', ID, (c) => c.notNull())
        .addColumn('transfer_group_id', ID)
        .addColumn('recurring_id', ID)
        .addColumn('created_at', TS, (c) => c.notNull())
        .addColumn('updated_at', TS, (c) => c.notNull())
        .addColumn('deleted_at', TS)
        .execute();
      await db.schema.createIndex('idx_tx_budget_date').on('transactions').columns(['budget_id', 'date']).execute();
      await db.schema.createIndex('idx_tx_account').on('transactions').column('account_id').execute();
      await db.schema.createIndex('idx_tx_to_account').on('transactions').column('to_account_id').execute();

      await db.schema
        .createTable('recurring')
        .addColumn('id', ID, (c) => c.primaryKey())
        .addColumn('budget_id', ID, (c) => c.notNull())
        .addColumn('name', 'varchar(100)', (c) => c.notNull())
        .addColumn('type', 'varchar(16)', (c) => c.notNull())
        .addColumn('category_id', ID)
        .addColumn('account_id', ID)
        .addColumn('amount', 'bigint', (c) => c.notNull())
        .addColumn('amount_varies', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('day_of_month', 'integer', (c) => c.notNull())
        .addColumn('day_pinned', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('remind_days', 'integer', (c) => c.notNull().defaultTo(3))
        .addColumn('is_paused', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('last_paid_date', 'varchar(10)')
        .addColumn('created_at', TS, (c) => c.notNull())
        .addColumn('updated_at', TS, (c) => c.notNull())
        .addColumn('deleted_at', TS)
        .execute();
      await db.schema.createIndex('idx_recurring_budget').on('recurring').column('budget_id').execute();

      await db.schema
        .createTable('recurring_skips')
        .addColumn('recurring_id', ID, (c) => c.notNull())
        .addColumn('month', 'varchar(7)', (c) => c.notNull())
        .addPrimaryKeyConstraint('pk_recurring_skips', ['recurring_id', 'month'])
        .execute();
    },
  },
};

migrations['0002_limits'] = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable('limits')
      .addColumn('id', ID, (c) => c.primaryKey())
      .addColumn('budget_id', ID, (c) => c.notNull())
      .addColumn('category_id', ID)
      .addColumn('amount', 'bigint', (c) => c.notNull())
      .addColumn('from_month', 'varchar(7)', (c) => c.notNull())
      .addColumn('created_at', TS, (c) => c.notNull())
      .addColumn('updated_at', TS, (c) => c.notNull())
      .execute();
    await db.schema.createIndex('idx_limits_budget').on('limits').column('budget_id').execute();
    await db.schema.alterTable('categories').addColumn('exclude_from_limit', 'integer', (c) => c.notNull().defaultTo(0)).execute();
    await db.schema.alterTable('budgets').addColumn('limit_include_recurring', 'integer', (c) => c.notNull().defaultTo(0)).execute();
  },
};

migrations['0003_recurring_interval'] = {
  async up(db: Kysely<any>) {
    // период регулярного платежа в месяцах: 1 — ежемесячно, 3 — раз в квартал и т.д.
    await db.schema.alterTable('recurring').addColumn('interval_months', 'integer', (c) => c.notNull().defaultTo(1)).execute();
  },
};

migrations['0004_planned'] = {
  async up(db: Kysely<any>) {
    // запланированные расходы: заметка о будущей покупке, опционально — с отложенными деньгами
    await db.schema
      .createTable('planned')
      .addColumn('id', ID, (c) => c.primaryKey())
      .addColumn('budget_id', ID, (c) => c.notNull())
      .addColumn('name', 'varchar(100)', (c) => c.notNull())
      .addColumn('amount', 'bigint', (c) => c.notNull())
      .addColumn('date', 'varchar(10)')
      .addColumn('category_id', ID)
      .addColumn('account_id', ID)
      .addColumn('comment', 'text')
      .addColumn('status', 'varchar(16)', (c) => c.notNull().defaultTo('active'))
      .addColumn('exclude_from_limit', 'integer', (c) => c.notNull().defaultTo(1))
      .addColumn('reserve_account_id', ID)
      .addColumn('transaction_id', ID)
      .addColumn('done_at', TS)
      .addColumn('created_by', ID, (c) => c.notNull())
      .addColumn('created_at', TS, (c) => c.notNull())
      .addColumn('updated_at', TS, (c) => c.notNull())
      .addColumn('deleted_at', TS)
      .execute();
    await db.schema.createIndex('idx_planned_budget').on('planned').column('budget_id').execute();
    await db.schema.alterTable('transactions').addColumn('planned_id', ID).execute();
  },
};

migrations['0005_planned_no_reserve'] = {
  // «Отложить под план» убрано: удаляем копилки планов и переводы в них/из них,
  // так что балансы счетов возвращаются к состоянию до откладывания.
  async up(db: Kysely<any>) {
    const now = new Date().toISOString();
    const plans = await db.selectFrom('planned').select(['id', 'reserve_account_id']).where('reserve_account_id', 'is not', null).execute();
    for (const p of plans) {
      const acc = p.reserve_account_id as string;
      const account = await db.selectFrom('accounts').select(['id', 'parent_account_id']).where('id', '=', acc).executeTakeFirst();
      // расходы, внесённые прямо с копилки, переезжают на счёт, с которого откладывали
      if (account?.parent_account_id) {
        await db
          .updateTable('transactions')
          .set({ account_id: account.parent_account_id, updated_at: now })
          .where('account_id', '=', acc)
          .where('type', '!=', 'transfer')
          .execute();
      }
      await db
        .updateTable('transactions')
        .set({ deleted_at: now, updated_at: now })
        .where('type', '=', 'transfer')
        .where('deleted_at', 'is', null)
        .where((eb) => eb.or([eb('account_id', '=', acc), eb('to_account_id', '=', acc)]))
        .execute();
      await db.updateTable('accounts').set({ deleted_at: now, updated_at: now }).where('id', '=', acc).execute();
      await db.updateTable('planned').set({ reserve_account_id: null }).where('id', '=', p.id).execute();
    }
  },
};

migrations['0006_credit'] = {
  async up(db: Kysely<any>) {
    // кредитные счета: kind = 'credit' (кредитка) | 'loan' (кредит); лимит кредитки в копейках
    await db.schema.alterTable('accounts').addColumn('credit_limit', 'bigint').execute();
  },
};

migrations['0007_credit_in_free'] = {
  async up(db: Kysely<any>) {
    // кредитка: учитывать доступный лимит в свободных деньгах
    await db.schema.alterTable('accounts').addColumn('include_in_free', 'integer', (c) => c.notNull().defaultTo(0)).execute();
  },
};

migrations['0008_planned_income'] = {
  async up(db: Kysely<any>) {
    // планы бывают и доходами: ожидаемая зарплата, возврат долга и т.п.
    await db.schema.alterTable('planned').addColumn('type', 'varchar(16)', (c) => c.notNull().defaultTo('expense')).execute();
  },
};

class InlineProvider implements MigrationProvider {
  async getMigrations() {
    return migrations;
  }
}

export async function migrate(db: Kysely<any>) {
  const migrator = new Migrator({ db, provider: new InlineProvider() });
  const { error, results } = await migrator.migrateToLatest();
  for (const r of results ?? []) {
    if (r.status === 'Error') console.error(`Миграция ${r.migrationName} не применилась`);
  }
  if (error) throw error;
}
