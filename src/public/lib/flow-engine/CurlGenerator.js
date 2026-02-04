/**
 * CurlGenerator - Shared cURL formatting and display utilities
 *
 * Provides syntax highlighting for cURL commands and utilities for
 * displaying actual vs template cURL commands.
 *
 * Usage:
 *   import { formatCurl, showActualCurl, escapeHtml } from './lib/flow-engine/CurlGenerator.js';
 *   showActualCurl('curl-1', curlCommand);
 */

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} - HTML-escaped string
 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Escape HTML for use in attributes
 * @param {string} str - String to escape
 * @returns {string} - Escaped string safe for attributes
 */
export function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

/**
 * Format a cURL command string with syntax highlighting
 * @param {string} curlStr - Raw cURL command string
 * @returns {string} - HTML-formatted cURL with syntax highlighting
 */
export function formatCurl(curlStr) {
  const e = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Parse the cURL command
  // Expected format: curl -X POST 'url' \n  -H 'header' \n  -d 'params'
  const lines = curlStr.split('\n');
  const outputLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle comment lines
    if (trimmed.startsWith('#')) {
      outputLines.push('<span class="curl-comment">' + e(line) + '</span>');
      continue;
    }

    // Check if this line has -d with data to split
    const dataMatch = trimmed.match(/^-d\s+['"](.+)['"]$/);
    if (dataMatch) {
      const dataContent = dataMatch[1];
      // Split by & to get individual parameters
      const params = dataContent.split('&');
      params.forEach((param, idx) => {
        const isLast = idx === params.length - 1;
        const continuation = isLast ? '' : ' <span class="curl-flag">\\</span>';
        outputLines.push('  <span class="curl-flag">-d</span> <span class="curl-data">\'' + e(param) + '\'</span>' + continuation);
      });
      continue;
    }

    // Handle curl command line
    if (trimmed.startsWith('curl ')) {
      let formatted = line;
      // Replace curl command
      formatted = formatted.replace(/^(\s*)(curl)(\s)/, '$1<span class="curl-cmd">$2</span>$3');
      // Replace -X METHOD
      formatted = formatted.replace(/(-X)\s+(\S+)/, '<span class="curl-flag">$1</span> <span class="curl-flag">$2</span>');
      // Replace --request METHOD
      formatted = formatted.replace(/(--request)\s+(\S+)/, '<span class="curl-flag">$1</span> <span class="curl-flag">$2</span>');
      // Replace URL in single quotes
      formatted = formatted.replace(/'(https?:\/\/[^']+)'/, '\'<span class="curl-url">$1</span>\'');
      // Replace URL in double quotes
      formatted = formatted.replace(/"(https?:\/\/[^"]+)"/, '"<span class="curl-url">$1</span>"');
      // Replace trailing backslash
      formatted = formatted.replace(/(\s)(\\)(\s*)$/, '$1<span class="curl-flag">$2</span>$3');
      outputLines.push(formatted);
      continue;
    }

    // Handle -H header line
    if (trimmed.startsWith('-H ')) {
      let formatted = line;
      formatted = formatted.replace(/(-H)\s+'([^']+)'/, '<span class="curl-flag">$1</span> <span class="curl-data">\'$2\'</span>');
      formatted = formatted.replace(/(-H)\s+"([^"]+)"/, '<span class="curl-flag">$1</span> <span class="curl-data">"$2"</span>');
      formatted = formatted.replace(/(\s)(\\)(\s*)$/, '$1<span class="curl-flag">$2</span>$3');
      outputLines.push(formatted);
      continue;
    }

    // Handle --url line
    if (trimmed.startsWith('--url ')) {
      let formatted = line;
      formatted = formatted.replace(/(--url)\s+'([^']+)'/, '<span class="curl-flag">$1</span> \'<span class="curl-url">$2</span>\'');
      formatted = formatted.replace(/(--url)\s+"([^"]+)"/, '<span class="curl-flag">$1</span> "<span class="curl-url">$2</span>"');
      formatted = formatted.replace(/(--url)\s+(\S+)/, '<span class="curl-flag">$1</span> <span class="curl-url">$2</span>');
      formatted = formatted.replace(/(\s)(\\)(\s*)$/, '$1<span class="curl-flag">$2</span>$3');
      outputLines.push(formatted);
      continue;
    }

    // Handle standalone -d line
    if (trimmed.startsWith('-d ')) {
      let formatted = line;
      formatted = formatted.replace(/(-d)\s+'([^']*)'/, '<span class="curl-flag">$1</span> <span class="curl-data">\'$2\'</span>');
      formatted = formatted.replace(/(-d)\s+"([^"]*)"/, '<span class="curl-flag">$1</span> <span class="curl-data">"$2"</span>');
      formatted = formatted.replace(/(\s)(\\)(\s*)$/, '$1<span class="curl-flag">$2</span>$3');
      outputLines.push(formatted);
      continue;
    }

    // Default: escape and output as-is
    outputLines.push(e(line));
  }

  return outputLines.join('\n');
}

/**
 * Display actual cURL command (after request is sent)
 * @param {string} elementId - ID of the element to update
 * @param {string} curl - The actual cURL command
 */
export function showActualCurl(elementId, curl) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerHTML = '<span class="curl-comment"># Actual request sent:</span>\n' + formatCurl(curl);
  el.classList.add('curl-actual');
}

/**
 * Clear the "actual" state from a cURL element (allow template to be shown again)
 * @param {string} elementId - ID of the element to clear
 */
export function clearActualCurl(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.classList.remove('curl-actual');
}

/**
 * Generate a cURL command from template parameters
 * @param {object} config - cURL configuration
 * @param {string} config.method - HTTP method (GET, POST, etc.)
 * @param {string} config.url - Request URL
 * @param {object} config.headers - Headers object
 * @param {object|string} config.body - Request body (object for form data, string for raw)
 * @param {string} config.comment - Optional comment line
 * @returns {string} - Formatted cURL command
 */
export function buildCurl({ method = 'POST', url, headers = {}, body, comment }) {
  const lines = [];

  if (comment) {
    lines.push(`# ${comment}`);
  }

  lines.push(`curl -X ${method} '${url}' \\`);

  // Add headers
  for (const [key, value] of Object.entries(headers)) {
    lines.push(`  -H '${key}: ${value}' \\`);
  }

  // Add body
  if (body) {
    if (typeof body === 'object') {
      // Form data
      const params = Object.entries(body)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      lines.push(`  -d '${params}'`);
    } else {
      // Raw body
      lines.push(`  -d '${body}'`);
    }
  } else {
    // Remove trailing backslash from last line
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, '');
  }

  return lines.join('\n');
}

/**
 * Create a cURL template with placeholder substitution
 * @param {string} template - cURL template with {{placeholders}}
 * @param {object} values - Values to substitute
 * @returns {string} - Interpolated cURL command
 */
export function interpolateCurlTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return values[key] !== undefined ? values[key] : match;
  });
}

// Default export for convenience
export default {
  escapeHtml,
  escapeAttr,
  formatCurl,
  showActualCurl,
  clearActualCurl,
  buildCurl,
  interpolateCurlTemplate,
};
