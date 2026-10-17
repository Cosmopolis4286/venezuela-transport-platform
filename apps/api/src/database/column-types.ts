import { customType } from 'drizzle-orm/pg-core';

/** Case-insensitive text (PostgreSQL `citext` extension, enabled by the baseline migration). */
export const citext = customType<{ data: string }>({ dataType: () => 'citext' });
