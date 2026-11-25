CREATE TABLE shared_shopping (
  id TEXT PRIMARY KEY NOT NULL,
  owner_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE shopping_rate (
  id TEXT PRIMARY KEY NOT NULL,
  minute INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
