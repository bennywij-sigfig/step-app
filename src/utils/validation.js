function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(email) {
  return email ? email.toLowerCase().trim() : email;
}

function isValidDate(dateString) {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

// HTML escaping to prevent XSS attacks
function escapeHtml(unsafe) {
  if (!unsafe || typeof unsafe !== 'string') return unsafe;
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Comprehensive input sanitization for user content
function sanitizeUserInput(input) {
  if (!input || typeof input !== 'string') return input;
  
  // Remove script tags and other dangerous elements
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove other potentially dangerous tags
  sanitized = sanitized.replace(/<(iframe|object|embed|link|style|meta|base)\b[^>]*>/gi, '');
  
  // Escape remaining HTML
  return escapeHtml(sanitized);
}

// Enhanced sanitization specifically for display names
function sanitizeDisplayName(name) {
  if (!name || typeof name !== 'string') return name;
  
  // Trim whitespace
  let sanitized = name.trim();
  
  // Remove any HTML tags completely
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Escape remaining special characters
  return escapeHtml(sanitized);
}

module.exports = {
  isValidEmail,
  normalizeEmail,
  isValidDate,
  escapeHtml,
  sanitizeUserInput,
  sanitizeDisplayName,
};