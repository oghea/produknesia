import "@testing-library/jest-dom/vitest";

// Fake but well-formed: satisfies src/db/index.ts's import guard while making
// any accidental live-DB query fail fast (connection refused).
process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:9/test_placeholder";
