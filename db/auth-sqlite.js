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
  function withAdmin(user, work) {
    return atomic(() => {
      const current = session(user.token);
      if (current?.id !== user.id || current.password !== user.password || current.admin !== 1) return 'forbidden';
      return work();
    });
  }
  const invitation = token => db.prepare(`SELECT i.creator,i.expires FROM invitations i JOIN accounts a ON a.id=i.creator
    WHERE i.token=? AND i.expires>? AND a.active=1 AND a.admin=1`).get(token, Date.now());
  const issueInvitation = (user, token) => withAdmin(user, () => {
    const expires = Date.now() + 86400000;
    db.prepare(`INSERT INTO invitations(id,token,creator,expires) VALUES(1,?,?,?)
      ON CONFLICT(id) DO UPDATE SET token=excluded.token,creator=excluded.creator,expires=excluded.expires`).run(token,user.id,expires);
    return {expires};
  });
  const revokeInvitation = user => withAdmin(user, () => {db.exec('DELETE FROM invitations');return true;});
  function insert(name, encoded, admin, duplicate = 'duplicate') {
    if (findUser(name)) return duplicate;
    db.prepare('INSERT INTO accounts(username,password,admin) VALUES(?,?,?)').run(name,encoded,admin?1:0);
    return true;
  }
  const join = (token, name, encoded) => atomic(() => {
    if (!invitation(token)) return 'invitation';
    const result = insert(name,encoded,false,'duplicate-invitee');
    if (result !== true) return result;
    db.prepare('DELETE FROM invitations WHERE token=?').run(token); return true;
  });
  const listAccounts = user => withAdmin(user, () => db.prepare('SELECT id,username,admin,active FROM accounts ORDER BY username').all());
  const addAccount = (user, name, encoded, admin) => withAdmin(user, () => insert(name,encoded,admin));
  const setActive = (user, id, active) => withAdmin(user, () => {
    if (id === user.id) return 'self';
    if (!db.prepare('SELECT id FROM accounts WHERE id=?').get(id)) return 'missing';
    db.prepare('UPDATE accounts SET active=? WHERE id=?').run(active?1:0,id);
    if (!active) db.prepare('DELETE FROM invitations WHERE creator=?').run(id);
    db.prepare('DELETE FROM sessions WHERE account_id=?').run(id); return true;
  });
  const prepareMail = (user, token) => withAdmin(user, () => {
    const invite = invitation(token); if (!invite) return 'invitation-mail';
    const now = Date.now(); db.prepare("DELETE FROM attempts WHERE key='invitation-mail' AND expires<=?").run(now);
    if ((db.prepare("SELECT count FROM attempts WHERE key='invitation-mail'").get()?.count || 0) >= 5) return 'mail-limit';
    db.prepare(`INSERT INTO attempts VALUES('invitation-mail',1,?) ON CONFLICT(key) DO UPDATE SET count=count+1`).run(now+3600000);
    return {expires:invite.expires};
  });
  return Object.freeze({ engine:'sqlite', findUser, session, throttle, startSession, logout, changePassword,
    invitation, issueInvitation, revokeInvitation, join, listAccounts, addAccount, setActive, prepareMail });
}

module.exports = { sqliteAuth };
