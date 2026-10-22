const DAY = 86400000;

function postgresAuth(db) {
  async function findUser(name) {
    if (name.includes('\0')) return undefined; // PostgreSQL text rejects NUL; an unknown username still gets the dummy hash.
    return (await db.query('SELECT id::float8 AS id,username,password,admin,active FROM auth.accounts WHERE username=$1', [name])).rows[0];
  }
  async function session(token) {
    const row = (await db.query(`SELECT a.id::float8 AS id,a.username,a.admin,a.password,s.token,s.expires
      FROM auth.sessions s JOIN auth.accounts a ON a.id=s.account_id WHERE s.token=$1 AND a.active=1`, [token])).rows[0];
    if (!row || Number(row.expires) <= Date.now()) return undefined;
    const { expires, ...user } = row;
    return user;
  }
  async function throttle(keys) {
    return db.transaction(async tx => {
      // This lock covers all three counters across application processes, never the scrypt work.
      await tx.query('SELECT pg_advisory_xact_lock(1296125511,2)');
      const now = Date.now();
      await tx.query('DELETE FROM auth.attempts WHERE expires<=$1', [now]);
      const counts = (await tx.query('SELECT key,count FROM auth.attempts WHERE key=ANY($1::text[])', [keys.map(([key]) => key)])).rows;
      if (keys.some(([key, max]) => (counts.find(row => row.key === key)?.count || 0) >= max)) return false;
      for (const [key] of keys) await tx.query(`INSERT INTO auth.attempts(key,count,expires) VALUES($1,1,$2)
        ON CONFLICT(key) DO UPDATE SET count=auth.attempts.count+1`, [key, now + 15 * 60000]);
      return true;
    });
  }
  async function lockAccount(tx, user) {
    return (await tx.query('SELECT password,active FROM auth.accounts WHERE id=$1 FOR UPDATE', [user.id])).rows[0];
  }
  const stillValid = (user, current) => Boolean(current?.active && current.password === user.password);

  async function startSession(user, token) {
    // Cleanup precedes the account lock: no cross-account session locks inside that transaction.
    await db.query('DELETE FROM auth.sessions WHERE expires<=$1', [Date.now()]);
    return db.transaction(async tx => {
      if (!stillValid(user, await lockAccount(tx, user))) return false;
      await tx.query('INSERT INTO auth.sessions(token,account_id,expires) VALUES($1,$2,$3)', [token, user.id, Date.now() + 7 * DAY]);
      return true;
    });
  }
  async function logout(user, all) {
    await db.transaction(async tx => {
      await lockAccount(tx, user);
      if (all) await tx.query('DELETE FROM auth.sessions WHERE account_id=$1', [user.id]);
      else await tx.query('DELETE FROM auth.sessions WHERE account_id=$1 AND token=$2', [user.id, user.token]);
    });
  }
  async function changePassword(user, encoded) {
    return db.transaction(async tx => {
      if (!stillValid(user, await lockAccount(tx, user))) return false;
      const row = (await tx.query('SELECT expires FROM auth.sessions WHERE account_id=$1 AND token=$2 FOR UPDATE', [user.id, user.token])).rows[0];
      if (!row || Number(row.expires) <= Date.now()) return false;
      await tx.query('UPDATE auth.accounts SET password=$1 WHERE id=$2', [encoded, user.id]);
      await tx.query('DELETE FROM auth.sessions WHERE account_id=$1', [user.id]);
      return true;
    });
  }
  return Object.freeze({ engine:'postgres', findUser, session, throttle, startSession, logout, changePassword });
}

module.exports = { postgresAuth };
