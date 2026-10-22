function sqliteAuth(db) {
  function atomic(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const findUser = name => db.prepare('SELECT * FROM accounts WHERE username=?').get(name);
  const session = token => db.prepare(`SELECT a.id,a.username,a.admin,a.password,s.token FROM sessions s
    JOIN accounts a ON a.id=s.account_id WHERE s.token=? AND s.expires>? AND a.active=1`).get(token, Date.now());
  const stillValid = user => {
    const current = db.prepare('SELECT password,active FROM accounts WHERE id=?').get(user.id);
    return Boolean(current?.active && current.password === user.password);
  };
  function throttle(keys) {
    return atomic(() => {
      const now = Date.now(); db.prepare('DELETE FROM attempts WHERE expires<=?').run(now);
      if (keys.some(([key, max]) => (db.prepare('SELECT count FROM attempts WHERE key=?').get(key)?.count || 0) >= max)) return false;
      for (const [key] of keys) db.prepare('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + 15 * 60000);
      return true;
    });
  }
  function startSession(user, token) {
    return atomic(() => {
      if (!stillValid(user)) return false;
      const now = Date.now(); db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
      db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token, user.id, now + 7 * 86400000);
      return true;
    });
  }
  function logout(user, all) {
    return atomic(() => {
      if (!stillValid(user) || session(user.token)?.id !== user.id) return false;
      if (all) db.prepare('DELETE FROM sessions WHERE account_id=?').run(user.id);
      else db.prepare('DELETE FROM sessions WHERE token=? AND account_id=?').run(user.token, user.id);
      return true;
    });
  }
  function changePassword(user, encoded) {
    return atomic(() => {
      if (!stillValid(user) || session(user.token)?.id !== user.id) return false;
      db.prepare('UPDATE accounts SET password=? WHERE id=?').run(encoded, user.id);
      db.prepare('DELETE FROM sessions WHERE account_id=?').run(user.id);
      return true;
    });
  }
  return Object.freeze({ engine:'sqlite', findUser, session, throttle, startSession, logout, changePassword });
}

module.exports = { sqliteAuth };
