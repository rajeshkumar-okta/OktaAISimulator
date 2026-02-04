import { Router } from 'express';
import * as logger from '../services/logger.js';

const router = Router();

/**
 * GET /api/logs
 * Returns list of all available log files with metadata.
 */
router.get('/', (req, res) => {
  const files = logger.listLogFilesWithMeta();
  const current = logger.getCurrentSessionFilename();
  res.json({ files, current });
});

/**
 * GET /api/logs/current
 * Returns the current session log content.
 */
router.get('/current', (req, res) => {
  const content = logger.getCurrentLog();
  if (!content) {
    return res.json({ content: '(No session log yet. Start a flow to begin logging.)', filename: null });
  }
  res.json({ content, filename: logger.getCurrentSessionFilename() });
});

/**
 * GET /api/logs/current/last-error
 * Returns the last error from the current session log, if any.
 */
router.get('/current/last-error', (req, res) => {
  const content = logger.getCurrentLog();
  if (!content) {
    return res.json({ error: null });
  }

  // Parse the log content to find the last ERROR entry
  const errorRegex = /----- \[([^\]]+)\] Step (\d+): ERROR -----\n\s*error: ([^\n]+)/g;
  let lastError = null;
  let match;

  while ((match = errorRegex.exec(content)) !== null) {
    lastError = {
      timestamp: match[1],
      step: parseInt(match[2], 10),
      message: match[3],
    };
  }

  res.json({ error: lastError });
});

/**
 * GET /api/logs/:filename
 * Returns content of a specific log file.
 */
router.get('/:filename', (req, res) => {
  const content = logger.getLogByFilename(req.params.filename);
  if (!content) {
    return res.status(404).json({ error: 'Log file not found' });
  }
  res.json({ content, filename: req.params.filename });
});

/**
 * DELETE /api/logs/:filename
 * Deletes a specific log file.
 */
router.delete('/:filename', (req, res) => {
  const result = logger.deleteLogFile(req.params.filename);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true });
});

export default router;
