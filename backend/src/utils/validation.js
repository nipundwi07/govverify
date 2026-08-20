const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ASSET_TYPES = ['fence', 'road', 'drainage', 'streetlight', 'other'];
const OFFICIAL_ROLES = ['junior_engineer', 'district_officer', 'admin'];
const SUBMISSION_REVIEW_STATUSES = ['approved', 'rejected'];

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function notFound(res, message) {
  return res.status(404).json({ error: message });
}

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function requireFields(body, fields) {
  const missing = fields.filter((field) => isMissing(body[field]));
  if (missing.length > 0) {
    return `Missing required fields: ${missing.join(', ')}`;
  }
  return null;
}

function parseUuid(value, fieldName) {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    return { error: `${fieldName} must be a valid UUID` };
  }
  return { value };
}

function parseNumber(value, fieldName, { min, max, integer } = {}) {
  const num = Number(value);
  if (Number.isNaN(num)) {
    return { error: `${fieldName} must be a number` };
  }
  if (integer && !Number.isInteger(num)) {
    return { error: `${fieldName} must be an integer` };
  }
  if (min !== undefined && num < min) {
    return { error: `${fieldName} must be >= ${min}` };
  }
  if (max !== undefined && num > max) {
    return { error: `${fieldName} must be <= ${max}` };
  }
  return { value: num };
}

function parseEnum(value, fieldName, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    return { error: `${fieldName} must be one of: ${allowed.join(', ')}` };
  }
  return { value };
}

function parseIsoTimestamp(value, fieldName) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    return { error: `${fieldName} must be a valid ISO 8601 timestamp` };
  }
  return { value };
}

function mapSupabaseError(error) {
  if (!error) {
    return { status: 500, message: 'Unexpected database error' };
  }

  if (error.code === '23503') {
    return {
      status: 400,
      message: 'Invalid reference: one of the provided foreign key IDs does not exist',
    };
  }

  if (error.code === '23505') {
    return {
      status: 400,
      message: 'Duplicate value: a record with that unique field already exists',
    };
  }

  return { status: 500, message: error.message || 'Unexpected database error' };
}

module.exports = {
  ASSET_TYPES,
  OFFICIAL_ROLES,
  SUBMISSION_REVIEW_STATUSES,
  badRequest,
  notFound,
  requireFields,
  parseUuid,
  parseNumber,
  parseEnum,
  parseIsoTimestamp,
  mapSupabaseError,
};
