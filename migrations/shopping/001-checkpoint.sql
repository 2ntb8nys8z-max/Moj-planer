-- Take a recovery point of every current shopping list, including historical formats.
-- Run explicitly on the selected database. The serving Worker never invokes this file.
CREATE TABLE IF NOT EXISTS shopping_v1_checkpoints (
  list_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (list_id, revision)
);

-- One statement sees a consistent set of rows. A different payload under an
-- already saved revision fails the entire insert instead of replacing evidence.
INSERT INTO shopping_v1_checkpoints (list_id, revision, content)
SELECT s.id, s.revision, s.content
FROM shared_shopping AS s
WHERE NOT EXISTS (
  SELECT 1 FROM shopping_v1_checkpoints AS c
  WHERE c.list_id = s.id AND c.revision = s.revision AND c.content = s.content
);
