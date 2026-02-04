import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDPS_DIR = path.resolve(__dirname, '../../data/idps');

const router = Router();

async function ensureIdpsDir() {
  await fs.mkdir(IDPS_DIR, { recursive: true });
}

function idpFilePath(id) {
  return path.join(IDPS_DIR, `${id}.json`);
}

/**
 * GET /api/idps
 * List all configured IdPs.
 */
router.get('/', async (req, res) => {
  try {
    await ensureIdpsDir();
    const files = await fs.readdir(IDPS_DIR);
    const idps = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(IDPS_DIR, file), 'utf-8');
        const entry = JSON.parse(raw);
        // Return metadata only (not secrets)
        idps.push({
          id: entry.id,
          name: entry.name,
          domain: entry.config?.oktaDomain || '',
          createdAt: entry.createdAt,
          createdBy: entry.createdBy,
          isPrimary: entry.isPrimary || false,
        });
      } catch {
        // Skip malformed files
      }
    }

    idps.sort((a, b) => (a.isPrimary ? -1 : 1));
    res.json(idps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/idps/check
 * Check if any IdPs are configured (for setup wizard redirect).
 */
router.get('/check', async (req, res) => {
  try {
    await ensureIdpsDir();
    const files = await fs.readdir(IDPS_DIR);
    const hasIdps = files.some(f => f.endsWith('.json'));
    res.json({ configured: hasIdps });
  } catch {
    res.json({ configured: false });
  }
});

/**
 * GET /api/idps/primary
 * Get the primary IdP configuration.
 */
router.get('/primary', async (req, res) => {
  try {
    await ensureIdpsDir();
    const files = await fs.readdir(IDPS_DIR);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(IDPS_DIR, file), 'utf-8');
        const entry = JSON.parse(raw);
        if (entry.isPrimary) {
          return res.json(entry);
        }
      } catch {
        // Skip malformed files
      }
    }

    res.status(404).json({ error: 'No primary IdP configured' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/idps/:id
 * Get a specific IdP configuration.
 */
router.get('/:id', async (req, res) => {
  try {
    const filePath = idpFilePath(req.params.id);
    const raw = await fs.readFile(filePath, 'utf-8');
    const entry = JSON.parse(raw);
    res.json(entry);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'IdP not found' });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/idps
 * Create a new IdP configuration.
 * Body: { name, config: { oktaDomain, clientId, clientSecret }, createdBy, isPrimary }
 */
router.post('/', async (req, res) => {
  try {
    const { name, config, createdBy, isPrimary } = req.body;

    if (!name || !config || !config.oktaDomain || !config.clientId) {
      return res.status(400).json({ error: 'name, config.oktaDomain, and config.clientId are required' });
    }

    await ensureIdpsDir();

    // If this is marked as primary, unmark any existing primary
    if (isPrimary) {
      const files = await fs.readdir(IDPS_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const filePath = path.join(IDPS_DIR, file);
          const raw = await fs.readFile(filePath, 'utf-8');
          const entry = JSON.parse(raw);
          if (entry.isPrimary) {
            entry.isPrimary = false;
            await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
          }
        } catch {
          // Skip malformed files
        }
      }
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const entry = {
      id,
      name,
      config,
      createdBy: createdBy || 'unknown',
      createdAt: now,
      updatedAt: now,
      isPrimary: isPrimary || false,
    };

    await fs.writeFile(idpFilePath(id), JSON.stringify(entry, null, 2));
    res.status(201).json({ id, name, createdAt: now, isPrimary: entry.isPrimary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/idps/:id
 * Update an IdP configuration.
 * Body: { name?, config?, isPrimary? }
 */
router.put('/:id', async (req, res) => {
  try {
    const filePath = idpFilePath(req.params.id);
    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf-8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'IdP not found' });
      }
      throw err;
    }

    const entry = JSON.parse(raw);
    const { name, config, isPrimary } = req.body;

    // If setting as primary, unmark any existing primary
    if (isPrimary && !entry.isPrimary) {
      await ensureIdpsDir();
      const files = await fs.readdir(IDPS_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const otherPath = path.join(IDPS_DIR, file);
          const otherRaw = await fs.readFile(otherPath, 'utf-8');
          const otherEntry = JSON.parse(otherRaw);
          if (otherEntry.isPrimary && otherEntry.id !== req.params.id) {
            otherEntry.isPrimary = false;
            await fs.writeFile(otherPath, JSON.stringify(otherEntry, null, 2));
          }
        } catch {
          // Skip malformed files
        }
      }
    }

    if (name !== undefined) entry.name = name;
    if (config !== undefined) entry.config = { ...entry.config, ...config };
    if (isPrimary !== undefined) entry.isPrimary = isPrimary;
    entry.updatedAt = new Date().toISOString();

    await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
    res.json({ id: entry.id, name: entry.name, isPrimary: entry.isPrimary, updatedAt: entry.updatedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/idps/:id
 * Delete an IdP configuration.
 */
router.delete('/:id', async (req, res) => {
  try {
    const filePath = idpFilePath(req.params.id);
    await fs.unlink(filePath);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'IdP not found' });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
