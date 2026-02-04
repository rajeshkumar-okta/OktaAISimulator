/**
 * Serverless-compatible logger for Vercel
 * Stores logs in memory and sends to Vercel's logging service
 */

// In-memory log storage (per request context)
let currentSessionLogs = [];
let currentSessionMeta = null;

/**
 * Start a new session log
 */
export function startSession(sessionType = 'ID-JAG Flow', userName = null) {
  const now = new Date();
  currentSessionMeta = {
    sessionType,
    userName,
    startTime: now.toISOString(),
    sessionId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
  currentSessionLogs = [];
  
  log(0, 'Session started', {
    sessionType,
    userName,
    timestamp: now.toISOString(),
  });
  
  return currentSessionMeta.sessionId;
}

/**
 * Log a message
 */
export function log(step, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    step,
    message,
    data,
  };
  
  currentSessionLogs.push(logEntry);
  
  // Also log to Vercel's standard output
  console.log(`[${step}] ${message}`, JSON.stringify(data));
  
  return logEntry;
}

/**
 * Get current session logs
 */
export function getSessionLogs() {
  return currentSessionLogs;
}

/**
 * Get session metadata
 */
export function getSessionMeta() {
  return currentSessionMeta;
}

/**
 * Get formatted logs for export
 */
export function getFormattedLogs() {
  return {
    meta: currentSessionMeta,
    logs: currentSessionLogs,
  };
}

/**
 * End session and return formatted output
 */
export function endSession() {
  const formatted = getFormattedLogs();
  
  log(0, 'Session ended', {
    timestamp: new Date().toISOString(),
    logCount: currentSessionLogs.length,
  });
  
  return formatted;
}

/**
 * Clear logs
 */
export function clearLogs() {
  currentSessionLogs = [];
  currentSessionMeta = null;
}

/**
 * Export logs as JSON
 */
export function exportAsJson() {
  return JSON.stringify(getFormattedLogs(), null, 2);
}

/**
 * Get single log entry
 */
export function getLog(index) {
  return currentSessionLogs[index] || null;
}

/**
 * Get logs by step
 */
export function getLogsByStep(step) {
  return currentSessionLogs.filter(log => log.step === step);
}
