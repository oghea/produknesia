import "@testing-library/jest-dom/vitest";
import { config } from "dotenv";

// Load DATABASE_URL etc. so modules that read process.env at import time
// (e.g. src/db/index.ts) don't throw. Tests never use the live `db` export —
// they always inject a PGlite `dbc` — so this only needs to satisfy the
// module-level env check, not establish a real connection.
config({ path: [".env.local", ".env"] });
