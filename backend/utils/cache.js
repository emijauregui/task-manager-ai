const fs = require('fs/promises');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'cache');

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCompactDateKey(date = new Date()) {
  return getDateKey(date).replace(/-/g, '');
}

function getCacheFilePath(filename) {
  return path.join(CACHE_DIR, filename);
}

async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  return CACHE_DIR;
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeJsonFile(filePath, data) {
  await ensureCacheDir();
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return filePath;
}

async function readCache(filename, options = {}) {
  const {
    maxAgeMinutes = null,
    allowStale = true,
  } = options;

  const filePath = getCacheFilePath(filename);
  const data = await readJsonFile(filePath);

  if (!data) {
    return {
      hit: false,
      exists: false,
      expired: false,
      ageMs: null,
      filePath,
      data: null,
    };
  }

  const stats = await fs.stat(filePath);
  const ageMs = Date.now() - stats.mtimeMs;
  const expired = maxAgeMinutes !== null && ageMs > maxAgeMinutes * 60 * 1000;

  return {
    hit: allowStale ? true : !expired,
    exists: true,
    expired,
    ageMs,
    filePath,
    data: allowStale || !expired ? data : null,
  };
}

async function writeCache(filename, data) {
  const filePath = getCacheFilePath(filename);
  await writeJsonFile(filePath, data);
  return filePath;
}

async function listCacheFiles(prefix = '') {
  await ensureCacheDir();
  const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => entry.name);
}

module.exports = {
  CACHE_DIR,
  ensureCacheDir,
  getCacheFilePath,
  getCompactDateKey,
  getDateKey,
  listCacheFiles,
  readCache,
  readJsonFile,
  writeCache,
  writeJsonFile,
};
