const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function parsePayload(row) {
  return JSON.parse(row.payload);
}

function runTransaction(db, callback) {
  db.exec("BEGIN");
  try {
    callback();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function createSavedSearchStore({ dataRoot, legacyJsonPath, legacyProfilesPath }) {
  fs.mkdirSync(dataRoot, { recursive: true });
  const dbPath = path.join(dataRoot, "property.sqlite");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_searches (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_saved_searches_user_updated
      ON saved_searches (user_email, updated_at DESC);

    CREATE TABLE IF NOT EXISTS user_profiles (
      login_email TEXT PRIMARY KEY,
      telegram_chat_id TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
  `);

  const count = db.prepare("SELECT COUNT(*) AS count FROM saved_searches").get().count;
  if (count === 0 && fs.existsSync(legacyJsonPath)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyJsonPath, "utf-8"));
      if (Array.isArray(legacy) && legacy.length > 0) {
        const insert = db.prepare(`
          INSERT OR REPLACE INTO saved_searches (id, user_email, updated_at, payload)
          VALUES (?, ?, ?, ?)
        `);
        runTransaction(db, () => {
          legacy.forEach((search) => {
            if (!search?.id || !search?.userEmail) return;
            insert.run(
              search.id,
              String(search.userEmail).toLowerCase(),
              search.updatedAt || search.createdAt || new Date().toISOString(),
              JSON.stringify(search)
            );
          });
        });
        console.log(`Imported ${legacy.length} saved search${legacy.length === 1 ? "" : "es"} into SQLite.`);
      }
    } catch (error) {
      console.error("Could not import legacy saved-searches.json:", error.message);
    }
  }

  const profileCount = db.prepare("SELECT COUNT(*) AS count FROM user_profiles").get().count;
  if (profileCount === 0 && legacyProfilesPath && fs.existsSync(legacyProfilesPath)) {
    try {
      const legacyProfiles = JSON.parse(fs.readFileSync(legacyProfilesPath, "utf-8"));
      if (Array.isArray(legacyProfiles) && legacyProfiles.length > 0) {
        const insertProfile = db.prepare(`
          INSERT OR REPLACE INTO user_profiles (login_email, telegram_chat_id, updated_at)
          VALUES (?, ?, ?)
        `);
        const now = new Date().toISOString();
        runTransaction(db, () => {
          legacyProfiles.forEach((profile) => {
            if (!profile?.email) return;
            insertProfile.run(
              String(profile.email).toLowerCase(),
              String(profile.telegramChatId || ""),
              profile.updatedAt || now
            );
          });
        });
        console.log(`Imported ${legacyProfiles.length} user profile${legacyProfiles.length === 1 ? "" : "s"} into SQLite.`);
      }
    } catch (error) {
      console.error("Could not import legacy user-profiles.json:", error.message);
    }
  }

  function getAll() {
    return db
      .prepare("SELECT payload FROM saved_searches ORDER BY updated_at DESC")
      .all()
      .map(parsePayload);
  }

  function saveAll(searches) {
    const insert = db.prepare(`
      INSERT INTO saved_searches (id, user_email, updated_at, payload)
      VALUES (?, ?, ?, ?)
    `);
    runTransaction(db, () => {
      db.prepare("DELETE FROM saved_searches").run();
      searches.forEach((search) => {
        insert.run(
          search.id,
          String(search.userEmail || "").toLowerCase(),
          search.updatedAt || search.createdAt || new Date().toISOString(),
          JSON.stringify(search)
        );
      });
    });
  }

  function getProfiles() {
    return db
      .prepare("SELECT login_email, telegram_chat_id FROM user_profiles ORDER BY login_email")
      .all()
      .map(row => ({
        email: row.login_email,
        telegramChatId: row.telegram_chat_id
      }));
  }

  function saveProfiles(profiles) {
    const insert = db.prepare(`
      INSERT INTO user_profiles (login_email, telegram_chat_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(login_email) DO UPDATE SET
        telegram_chat_id = excluded.telegram_chat_id,
        updated_at = excluded.updated_at
    `);
    const now = new Date().toISOString();
    runTransaction(db, () => {
      db.prepare("DELETE FROM user_profiles").run();
      profiles.forEach((profile) => {
        if (!profile?.email) return;
        insert.run(
          String(profile.email).toLowerCase(),
          String(profile.telegramChatId || ""),
          profile.updatedAt || now
        );
      });
    });
  }

  return {
    dbPath,
    getAll,
    saveAll,
    getProfiles,
    saveProfiles
  };
}

module.exports = {
  createSavedSearchStore
};
