const sanitizeHtml = require("sanitize-html");

function sendOk(res, data = {}, status = 200) {
  return res.status(status).json(data);
}

function sendError(res, status, message, extra = {}) {
  return res.status(status).json({
    error: message,
    requestId: res.req?.id,
    ...extra
  });
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requireSession(req, res) {
  if (req.session?.username) return true;
  sendError(res, 401, "Unauthorized");
  return false;
}

function cleanText(value, maxLength = 1000) {
  return sanitizeHtml(String(value || ""), {
    allowedTags: [],
    allowedAttributes: {}
  }).trim().slice(0, maxLength);
}

function parsePositiveInt(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

module.exports = {
  asyncHandler,
  cleanText,
  parsePositiveInt,
  requireSession,
  sendError,
  sendOk
};
