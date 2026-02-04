import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '../../logs');

let currentSessionFile = null;
let currentSessionFilename = null;
let currentSessionMeta = null;

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

/**
 * Start a new session log file.
 * @param {string} sessionType - Type of session (e.g., 'auth-code-flow', 'agentic-token-exchange')
 * @param {string} userName - Name of the user who started the session
 * Returns the session filename for reference.
 */
export function startSession(sessionType = 'ID-JAG Flow', userName = null) {
  ensureLogsDir();
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-');
  // Include flow type in filename for easier parsing
  const flowSlug = sessionType.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const filename = `session-${flowSlug}-${ts}.log`;
  currentSessionFile = path.join(LOGS_DIR, filename);
  currentSessionFilename = filename;

  // Map session types to display names
  const sessionNames = {
    'auth-code-flow': 'Auth Code Flow',
    'agentic-token-exchange': 'Agentic Token Exchange',
  };
  const displayName = sessionNames[sessionType] || sessionType;

  // Store metadata for this session
  currentSessionMeta = {
    flow: sessionType,
    flowDisplayName: displayName,
    user: userName,
    startedAt: now.toISOString(),
  };

  const header = [
    '='.repeat(70),
    `  ${displayName} Session`,
    `  Started: ${now.toISOString()}`,
    userName ? `  User: ${userName}` : null,
    '='.repeat(70),
    '',
  ].filter(Boolean).join('\n');

  // Write metadata as JSON comment at the start for parsing
  const metaLine = `<!-- META:${JSON.stringify(currentSessionMeta)} -->\n`;
  fs.writeFileSync(currentSessionFile, metaLine + header);
  return filename;
}

/**
 * Get the current session log content.
 */
export function getCurrentLog() {
  if (!currentSessionFile || !fs.existsSync(currentSessionFile)) {
    return null;
  }
  return fs.readFileSync(currentSessionFile, 'utf-8');
}

/**
 * Get the current session filename.
 */
export function getCurrentSessionFilename() {
  return currentSessionFilename;
}

/**
 * List all available log files with metadata, sorted by most recent first.
 */
export function listLogFiles() {
  ensureLogsDir();
  try {
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.log'))
      .sort()
      .reverse(); // Most recent first
    return files;
  } catch {
    return [];
  }
}

/**
 * Get metadata for a log file by reading the first line.
 */
export function getLogMetadata(filename) {
  const sanitized = path.basename(filename);
  const filePath = path.join(LOGS_DIR, sanitized);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const firstLine = content.split('\n')[0];
    const metaMatch = firstLine.match(/<!-- META:(.+) -->/);
    if (metaMatch) {
      return JSON.parse(metaMatch[1]);
    }

    // Fallback: try to extract info from content if no META line
    const flowMatch = content.match(/^\s+(.+) Session$/m);
    const userMatch = content.match(/^\s+User: (.+)$/m);
    const startedMatch = content.match(/^\s+Started: (.+)$/m);

    return {
      flow: flowMatch ? flowMatch[1] : 'Unknown',
      flowDisplayName: flowMatch ? flowMatch[1] : 'Unknown',
      user: userMatch ? userMatch[1] : null,
      startedAt: startedMatch ? startedMatch[1] : null,
    };
  } catch {
    return null;
  }
}

/**
 * List all log files with their metadata.
 */
export function listLogFilesWithMeta() {
  const files = listLogFiles();
  return files.map(filename => {
    const meta = getLogMetadata(filename);
    return {
      filename,
      ...meta,
    };
  });
}

/**
 * Delete a log file by filename.
 * Returns true if deleted, false if not found or is current session.
 */
export function deleteLogFile(filename) {
  const sanitized = path.basename(filename);

  // Don't allow deleting current session
  if (sanitized === currentSessionFilename) {
    return { success: false, error: 'Cannot delete current session log' };
  }

  const filePath = path.join(LOGS_DIR, sanitized);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'Log file not found' };
  }

  try {
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Get content of a specific log file by filename.
 */
export function getLogByFilename(filename) {
  // Sanitize filename to prevent directory traversal
  const sanitized = path.basename(filename);
  const filePath = path.join(LOGS_DIR, sanitized);

  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Log a step event to the current session file.
 */
export function log(step, action, data = {}) {
  if (!currentSessionFile) startSession();

  const now = new Date();
  const entry = {
    timestamp: now.toISOString(),
    step,
    action,
    ...data,
  };

  const lines = [
    '',
    `----- [${now.toISOString()}] Step ${step}: ${action} -----`,
  ];

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null) {
      lines.push(`  ${key}:`);
      lines.push(indent(JSON.stringify(value, null, 2), 4));
    } else {
      lines.push(`  ${key}: ${value}`);
    }
  }

  lines.push('');
  fs.appendFileSync(currentSessionFile, lines.join('\n'));
}

/**
 * Log an outbound HTTP request.
 */
export function logRequest(step, method, url, body) {
  log(step, `${method} ${url}`, {
    request: typeof body === 'string' ? parseFormBody(body) : body,
  });
}

/**
 * Log an HTTP response.
 */
export function logResponse(step, status, body) {
  log(step, `Response (${status})`, {
    response: body,
  });
}

/**
 * Log an error. Returns the timestamp for linking to the log viewer.
 */
export function logError(step, error) {
  const ts = new Date().toISOString();
  log(step, 'ERROR', {
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
  });
  return ts;
}

/**
 * Build a full cURL command string from request details.
 */
export function buildCurl(method, url, formBody) {
  const params = new URLSearchParams(formBody);
  const parts = [];
  for (const [k, v] of params.entries()) {
    parts.push(`${k}=${v}`);
  }
  const dataStr = parts.join('&');

  return `curl -X ${method} '${url}' \\\n` +
    `  -H 'Content-Type: application/x-www-form-urlencoded' \\\n` +
    `  -d '${dataStr}'`;
}

/**
 * Log a full cURL command for a step.
 */
export function logCurl(step, method, url, formBody) {
  const curl = buildCurl(method, url, formBody);
  if (!currentSessionFile) startSession();

  const now = new Date();
  const lines = [
    '',
    `----- [${now.toISOString()}] Step ${step}: cURL -----`,
    curl,
    '',
  ];
  fs.appendFileSync(currentSessionFile, lines.join('\n'));
  return curl;
}

function indent(str, spaces) {
  const pad = ' '.repeat(spaces);
  return str.split('\n').map(line => pad + line).join('\n');
}

function parseFormBody(body) {
  try {
    const params = new URLSearchParams(body);
    const obj = {};
    for (const [k, v] of params.entries()) {
      // Truncate long token values for readability
      obj[k] = v.length > 200 ? v.substring(0, 80) + '...[truncated]...' + v.substring(v.length - 20) : v;
    }
    return obj;
  } catch {
    return body;
  }
}
