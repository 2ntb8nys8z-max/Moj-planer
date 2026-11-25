import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

// Inspect a local SQLite replica, including the results of 001-checkpoint.sql.
// No product, list identifier, display name or credential goes to the terminal.
function isMap(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nickKey(nick) {
  return nick.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pl');
}

export function inspectDatabase(db) {
  const report = {
    lists: 0, checkpointMatches: 0, malformed: 0, products: 0, purchased: 0,
    legacyAnonymous: 0, unlimitedLinks: 0, unclaimedSeats: 0, joinedPeople: 0,
    removedPeople: 0, nicknameCollisions: 0
  };
  db.exec('BEGIN');
  try {
    const hasCheckpoint = !!db.prepare(
      "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='shopping_v1_checkpoints'"
    ).get();
    const matches = hasCheckpoint ? `EXISTS (
      SELECT 1 FROM shopping_v1_checkpoints c
      WHERE c.list_id=s.id AND c.revision=s.revision AND c.content=s.content
    )` : '0';
    for (const record of db.prepare(`SELECT s.content, ${matches} AS saved FROM shared_shopping s`).iterate()) {
      report.lists++;
      report.checkpointMatches += record.saved;
      let state;
      try { state = JSON.parse(record.content); } catch { /* Count unreadable lists below. */ }
      if (!isMap(state) || !Array.isArray(state.rows) || !isMap(state.participants)
        || !Object.values(state.participants).every(nick => typeof nick === 'string' && nickKey(nick))
        || !state.rows.every(row => isMap(row) && typeof row.text === 'string' && typeof row.done === 'boolean')
        || (Object.hasOwn(state, 'invites') && (!isMap(state.invites) || !Object.values(state.invites).every(isMap)))
        || (Object.hasOwn(state, 'openLinks') && !isMap(state.openLinks))) {
        report.malformed++;
        continue;
      }
      report.products += state.rows.length;
      report.purchased += state.rows.filter(row => row.done).length;
      if (!state.invites) report.legacyAnonymous++;
      report.unlimitedLinks += Object.keys(state.openLinks ?? {}).length;
      const seats = Object.values(state.invites ?? {});
      report.unclaimedSeats += seats.filter(seat => !seat.actor && !seat.revoked).length;
      const active = new Set(seats.filter(seat => !seat.revoked).map(seat => seat.actor));
      const participants = Object.entries(state.participants);
      report.joinedPeople += participants.length;
      if (state.invites) report.removedPeople += participants.filter(([actor]) => !active.has(actor)).length;
      // Production 33.370 has a single owner whose display name is reserved on every list.
      const names = new Set([nickKey('Robert')]);
      for (const [, nick] of participants) {
        const key = nickKey(nick);
        if (names.has(key)) report.nicknameCollisions++;
        names.add(key);
      }
    }
    return { ...report, hasCheckpoint };
  } finally {
    db.exec('ROLLBACK');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) {
    console.error('Użycie: node scripts/check-shopping-migration.mjs <lokalna-baza.sqlite>');
    process.exitCode = 1;
  } else {
    let db;
    try {
      db = new DatabaseSync(process.argv[2], { readOnly: true });
      const report = inspectDatabase(db);
      console.log(JSON.stringify(report, null, 2));
      if (!report.hasCheckpoint || report.checkpointMatches !== report.lists || report.malformed) process.exitCode = 2;
    } catch {
      console.error('Nie można sprawdzić kopii. Zweryfikuj format SQLite i obecność tabeli zakupów.');
      process.exitCode = 1;
    } finally { db?.close(); }
  }
}
