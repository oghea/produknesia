import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

// Common interface satisfied by the Neon client, PGlite client, and
// transaction objects — lets query functions accept any of them.
export type DBClient = PgDatabase<PgQueryResultHKT, typeof schema>;
