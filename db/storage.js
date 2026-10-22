function storageEngine(env = process.env) {
  const engine = env.MANGER_STORAGE === undefined ? 'sqlite' : env.MANGER_STORAGE;
  if (!['sqlite', 'postgres'].includes(engine)) {
    const error = new Error('MANGER_STORAGE doit être sqlite ou postgres.');
    error.code = 'MANGER_STORAGE_INVALID';
    throw error;
  }
  return engine;
}

module.exports = { storageEngine };
