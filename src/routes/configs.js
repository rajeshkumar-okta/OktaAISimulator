import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');

const router = Router();

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function configFilePath(id) {
  return path.join(DATA_DIR, `${id}.json`);
}

/**
 * GET /api/configs
 * List all saved configurations.
 */
router.get('/', async (req, res) => {
  try {
    await ensureDataDir();
    const files = await fs.readdir(DATA_DIR);
    const configs = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
        const entry = JSON.parse(raw);
        // Return metadata and config (needed for loading)
        configs.push({
          id: entry.id,
          name: entry.name,
          creator: entry.creator,
          note: entry.note || '',
          configurationType: entry.configurationType || '',
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          config: entry.config,
        });
      } catch {
        // Skip malformed files
      }
    }

    configs.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/configs/:id
 * Load a specific configuration.
 */
router.get('/:id', async (req, res) => {
  try {
    const filePath = configFilePath(req.params.id);
    const raw = await fs.readFile(filePath, 'utf-8');
    const entry = JSON.parse(raw);
    res.json(entry);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Config not found' });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/configs
 * Save a new configuration.
 * Body: { name, creator, config }
 */
router.post('/', async (req, res) => {
  try {
    const { name, creator, note, configurationType, config } = req.body;
    if (!name || !creator || !config) {
      return res.status(400).json({ error: 'name, creator, and config are required' });
    }

    await ensureDataDir();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const entry = {
      id,
      name,
      creator,
      note: note || '',
      configurationType: configurationType || '',
      createdAt: now,
      updatedAt: now,
      config,
    };

    await fs.writeFile(configFilePath(id), JSON.stringify(entry, null, 2));
    res.status(201).json({ id, name, creator, note: entry.note, createdAt: now, updatedAt: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/configs/:id
 * Update an existing configuration. Anyone can update.
 * Body: { name?, config? }
 */
router.put('/:id', async (req, res) => {
  try {
    const filePath = configFilePath(req.params.id);
    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Config not found' });
      }
      throw err;
    }

    const entry = JSON.parse(raw);
    const { name, config } = req.body;

    if (name) entry.name = name;
    if (config) entry.config = config;
    entry.updatedAt = new Date().toISOString();

    await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
    res.json({ id: entry.id, name: entry.name, creator: entry.creator, updatedAt: entry.updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/configs/:id
 * Delete a configuration. Only the creator can delete.
 * Query: ?creator=name
 */
router.delete('/:id', async (req, res) => {
  try {
    const filePath = configFilePath(req.params.id);
    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Config not found' });
      }
      throw err;
    }

    const entry = JSON.parse(raw);
    const requestCreator = req.query.creator;

    if (entry.creator !== requestCreator) {
      return res.status(403).json({ error: 'Only the creator can delete this configuration' });
    }

    await fs.unlink(filePath);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
