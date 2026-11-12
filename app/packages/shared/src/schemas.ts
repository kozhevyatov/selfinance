import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД');
const id = z.string().min(1).max(36);
const optId = id.nullish();

export const registrationModes = ['open', 'invite', 'closed'] as const;
export type RegistrationMode = (typeof registrationModes)[number];

export const accountKinds = ['cash', 'bank', 'deposit', 'savings'] as const;
export type AccountKind = (typeof accountKinds)[number];

export const txTypes = ['income', 'expense', 'transfer', 'adjustment'] as const;
export type TxType = (typeof txTypes)[number];

export const categoryTypes = ['income', 'expense'] as const;
export type CategoryType = (typeof categoryTypes)[number];

/* ---------- мастер настройки ---------- */

export const dbConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sqlite') }),
  z.object({
    type: z.literal('mysql'),
    host: z.string().min(1, 'Укажите хост'),
    port: z.coerce.number().int().min(1).max(65535).default(3306),
    user: z.string().min(1, 'Укажите пользователя'),
    password: z.string().default(''),
    database: z.string().regex(/^[A-Za-z0-9_]+$/, 'Только латиница, цифры и _'),
  }),
]);
export type DbConfigInput = z.infer<typeof dbConfigSchema>;

export const passwordSchema = z.string().min(6, 'Минимум 6 символов').max(200);

export const setupSchema = z.object({
  db: dbConfigSchema,
  admin: z.object({
    name: z.string().trim().min(1, 'Укажите имя').max(100),
    login: z.string().trim().min(3, 'Укажите email или телефон'),
    password: passwordSchema,
  }),
  registration: z.enum(registrationModes),
  timezone: z.string().max(64).optional(),
});
export type SetupInput = z.infer<typeof setupSchema>;

/* ---------- авторизация ---------- */

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя').max(100),
  login: z.string().trim().min(3, 'Укажите email или телефон'),
  password: passwordSchema,
  inviteCode: z.string().max(64).optional(),
  timezone: z.string().max(64).optional(),
  deviceName: z.string().max(100).optional(),
});

export const loginSchema = z.object({
  login: z.string().trim().min(1, 'Укажите email или телефон'),
  password: z.string().min(1, 'Укажите пароль'),
  deviceName: z.string().max(100).optional(),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().max(255).nullish(),
  phone: z.string().trim().max(32).nullish(),
  timezone: z.string().max(64).optional(),
  currentPassword: z.string().optional(),
  newPassword: passwordSchema.optional(),
});

/* ---------- бюджеты ---------- */

export const budgetCreateSchema = z.object({ name: z.string().trim().min(1).max(100) });

/* ---------- счета ---------- */

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название').max(100),
  kind: z.enum(accountKinds),
  isFrozen: z.boolean().optional(),
  bankName: z.string().trim().max(100).nullish(),
  parentAccountId: optId,
  color: z.string().max(16).nullish(),
  icon: z.string().max(32).nullish(),
  note: z.string().max(1000).nullish(),
  initialBalance: z.number().int().optional(), // копейки
});
export const accountUpdateSchema = accountCreateSchema.omit({ initialBalance: true }).partial().extend({
  isArchived: z.boolean().optional(),
  sort: z.number().int().optional(),
});
export const reconcileSchema = z.object({ actualBalance: z.number().int(), date: isoDate.optional() });

/* ---------- категории ---------- */

export const categoryCreateSchema = z.object({
  type: z.enum(categoryTypes),
  name: z.string().trim().min(1, 'Укажите название').max(100),
  parentId: optId,
  color: z.string().max(16).nullish(),
  icon: z.string().max(32).nullish(),
});
export const categoryUpdateSchema = categoryCreateSchema.omit({ type: true }).partial().extend({
  isArchived: z.boolean().optional(),
  sort: z.number().int().optional(),
  excludeFromLimit: z.boolean().optional(),
});

/* ---------- лимиты ---------- */

const month = z.string().regex(/^\d{4}-\d{2}$/, 'Месяц в формате ГГГГ-ММ');
export const limitsQuerySchema = z.object({ month });
/** amount = 0 — убрать лимит начиная с месяца fromMonth */
export const limitSetSchema = z.object({
  categoryId: optId,
  amount: z.number().int().min(0),
  fromMonth: month,
});
export const limitSettingsSchema = z.object({ includeRecurring: z.boolean() });

/* ---------- операции ---------- */

export const txCreateSchema = z.object({
  type: z.enum(txTypes),
  amount: z.number().int(), // копейки; для adjustment — со знаком, для остальных > 0
  date: isoDate,
  time: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  accountId: optId, // если не указан — счёт по умолчанию (единственный)
  toAccountId: optId,
  categoryId: optId,
  comment: z.string().max(500).nullish(),
  recurringId: optId, // оплата регулярного платежа
});
export type TxCreateInput = z.infer<typeof txCreateSchema>;
export const txUpdateSchema = txCreateSchema.partial();

export const txListQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  type: z.enum(txTypes).optional(),
  account: id.optional(),
  category: id.optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(80).optional(),
});

export const rangeQuerySchema = z.object({ from: isoDate, to: isoDate, categoryId: id.optional() });

/* ---------- регулярные платежи ---------- */

export const recurringCreateSchema = z.union([
  z.object({
    transactionId: id,
    name: z.string().trim().max(100).optional(),
    remindDays: z.number().int().min(0).max(14).optional(),
    intervalMonths: z.number().int().min(1).max(12).optional(),
  }),
  z.object({
    name: z.string().trim().min(1, 'Укажите название').max(100),
    type: z.enum(categoryTypes),
    amount: z.number().int().positive('Сумма должна быть больше нуля'),
    categoryId: optId,
    accountId: optId,
    dayOfMonth: z.number().int().min(1).max(31),
    dayPinned: z.boolean().optional(),
    intervalMonths: z.number().int().min(1).max(12).optional(),
    remindDays: z.number().int().min(0).max(14).optional(),
  }),
]);
export const recurringUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  amount: z.number().int().positive().optional(),
  amountVaries: z.boolean().optional(),
  categoryId: optId,
  accountId: optId,
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  dayPinned: z.boolean().optional(),
  intervalMonths: z.number().int().min(1).max(12).optional(),
  remindDays: z.number().int().min(0).max(14).optional(),
  isPaused: z.boolean().optional(),
});
export const recurringLinkSchema = z.object({ transactionId: id });

/* ---------- админка ---------- */

export const adminSettingsSchema = z.object({ registration: z.enum(registrationModes) });

export const adminUserCreateSchema = z.object({
  name: z.string().trim().min(1, 'Укажите имя').max(100),
  login: z.string().trim().min(3, 'Укажите email или телефон'),
  password: passwordSchema,
  isAdmin: z.boolean().optional(),
});
export const adminUserUpdateSchema = z.object({
  isBlocked: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  password: passwordSchema.optional(),
});
export const inviteCreateSchema = z.object({ days: z.number().int().min(1).max(90).default(7) });

export const dynamicsQuerySchema = z.object({
  to: z.string().regex(/^\d{4}-\d{2}$/),
  months: z.coerce.number().int().min(1).max(60).default(12),
  categoryId: id.optional(),
});
