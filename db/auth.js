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
    return (await tx.query('SELECT password,active,admin FROM auth.accounts WHERE id=$1 FOR UPDATE', [user.id])).rows[0];
  }
  const stillValid = (user, current) => Boolean(current?.active && current.password === user.password);
  async function hasSession(tx, user) {
    const row = (await tx.query('SELECT expires FROM auth.sessions WHERE account_id=$1 AND token=$2 FOR UPDATE', [user.id, user.token])).rows[0];
    return Boolean(row && Number(row.expires) > Date.now());
  }

  async function startSession(user, token) {
    // Never wait on sessions held by a password change; expiry still rejects skipped rows.
    await db.query(`WITH expired AS MATERIALIZED (
      SELECT token FROM auth.sessions WHERE expires<=$1 ORDER BY token LIMIT 100 FOR UPDATE SKIP LOCKED
    ) DELETE FROM auth.sessions s USING expired e WHERE s.token=e.token`, [Date.now()]);
    return db.transaction(async tx => {
      if (!stillValid(user, await lockAccount(tx, user))) return false;
      await tx.query('INSERT INTO auth.sessions(token,account_id,expires) VALUES($1,$2,$3)', [token, user.id, Date.now() + 7 * DAY]);
      return true;
    });
  }
  async function logout(user, all) {
    return db.transaction(async tx => {
      if (!stillValid(user, await lockAccount(tx, user)) || !await hasSession(tx, user)) return false;
      if (all) await tx.query('DELETE FROM auth.sessions WHERE account_id=$1', [user.id]);
      else await tx.query('DELETE FROM auth.sessions WHERE account_id=$1 AND token=$2', [user.id, user.token]);
      return true;
    });
  }
  async function changePassword(user, encoded) {
    return db.transaction(async tx => {
      if (!stillValid(user, await lockAccount(tx, user))) return false;
      if (!await hasSession(tx, user)) return false;
      await tx.query('UPDATE auth.accounts SET password=$1 WHERE id=$2', [encoded, user.id]);
      await tx.query('DELETE FROM auth.sessions WHERE account_id=$1', [user.id]);
      return true;
    });
  }
  const accessLock = tx => tx.query('SELECT pg_advisory_xact_lock(1296125511,3)');
  async function administrator(tx, user) {
    const current = await lockAccount(tx, user);
    return stillValid(user, current) && current.admin === 1 && await hasSession(tx, user);
  }
  function withAdmin(user, work) {
    return db.transaction(async tx => {
      await accessLock(tx);
      if (!await administrator(tx, user)) return 'forbidden';
      return work(tx);
    });
  }
  async function readInvitation(tx, token) {
    const row = (await tx.query(`SELECT i.creator::float8 AS creator,i.expires FROM auth.invitations i
      JOIN auth.accounts a ON a.id=i.creator WHERE i.token=$1 AND a.active=1 AND a.admin=1`, [token])).rows[0];
    return row && Number(row.expires) > Date.now() ? {...row,expires:Number(row.expires)} : undefined;
  }
  const invitation = token => readInvitation(db, token);
  const issueInvitation = (user, token) => withAdmin(user, async tx => {
    const expires = Date.now() + DAY;
    await tx.query(`INSERT INTO auth.invitations(id,token,creator,expires) VALUES(1,$1,$2,$3)
      ON CONFLICT(id) DO UPDATE SET token=excluded.token,creator=excluded.creator,expires=excluded.expires`, [token,user.id,expires]);
    return {expires};
  });
  const revokeInvitation = user => withAdmin(user, async tx => { await tx.query('DELETE FROM auth.invitations'); return true; });
  function join(token, name, encoded) {
    return db.transaction(async tx => {
      await accessLock(tx);
      const invite = await readInvitation(tx, token);
      if (!invite) return 'invitation';
      const creator = await lockAccount(tx, {id:invite.creator});
      if (!creator?.active || !creator.admin || invite.expires <= Date.now()) return 'invitation';
      const inserted = await tx.query(`INSERT INTO auth.accounts(username,password,admin) VALUES($1,$2,0)
        ON CONFLICT(username) DO NOTHING RETURNING id`, [name,encoded]);
      if (!inserted.rowCount) return 'duplicate-invitee';
      await tx.query('DELETE FROM auth.invitations WHERE token=$1', [token]);
      return true;
    });
  }
  const listAccounts = user => withAdmin(user, async tx =>
    (await tx.query('SELECT id::float8 AS id,username,admin,active FROM auth.accounts ORDER BY username COLLATE "C"')).rows);
  const addAccount = (user, name, encoded, admin) => withAdmin(user, async tx => {
    const result = await tx.query(`INSERT INTO auth.accounts(username,password,admin) VALUES($1,$2,$3)
      ON CONFLICT(username) DO NOTHING RETURNING id`, [name,encoded,admin?1:0]);
    return result.rowCount ? true : 'duplicate';
  });
  const setActive = (user, id, active) => withAdmin(user, async tx => {
    if (id === user.id) return 'self';
    const target = await lockAccount(tx, {id});
    if (!await hasSession(tx, user)) return 'forbidden';
    if (!target) return 'missing';
    await tx.query('UPDATE auth.accounts SET active=$1 WHERE id=$2', [active?1:0,id]);
    if (!active) await tx.query('DELETE FROM auth.invitations WHERE creator=$1', [id]);
    await tx.query('DELETE FROM auth.sessions WHERE account_id=$1', [id]);
    return true;
  });
  const prepareMail = (user, token) => withAdmin(user, async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(1296125511,2)');
    if (!await hasSession(tx, user)) return 'forbidden';
    const invite = await readInvitation(tx, token);
    if (!invite) return 'invitation-mail';
    const now = Date.now();
    await tx.query("DELETE FROM auth.attempts WHERE key='invitation-mail' AND expires<=$1", [now]);
    const attempt = (await tx.query("SELECT count FROM auth.attempts WHERE key='invitation-mail'")).rows[0];
    if (attempt?.count >= 5) return 'mail-limit';
    await tx.query(`INSERT INTO auth.attempts(key,count,expires) VALUES('invitation-mail',1,$1)
      ON CONFLICT(key) DO UPDATE SET count=auth.attempts.count+1`, [now+3600000]);
    return {expires:invite.expires};
  });
  return Object.freeze({ engine:'postgres', findUser, session, throttle, startSession, logout, changePassword,
    invitation, issueInvitation, revokeInvitation, join, listAccounts, addAccount, setActive, prepareMail });
}

module.exports = { postgresAuth };
