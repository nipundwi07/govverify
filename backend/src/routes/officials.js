const express = require('express');
const supabase = require('../supabaseClient');
const asyncHandler = require('../middleware/asyncHandler');
const {
  OFFICIAL_ROLES,
  badRequest,
  requireFields,
  parseEnum,
  mapSupabaseError,
} = require('../utils/validation');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('officials')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      const mapped = mapSupabaseError(error);
      return res.status(mapped.status).json({ error: mapped.message });
    }

    return res.json(data);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const missing = requireFields(req.body, ['name', 'district', 'role', 'phone']);
    if (missing) {
      return badRequest(res, missing);
    }

    if (typeof req.body.name !== 'string' || req.body.name.trim() === '') {
      return badRequest(res, 'name must be a non-empty string');
    }

    if (typeof req.body.district !== 'string' || req.body.district.trim() === '') {
      return badRequest(res, 'district must be a non-empty string');
    }

    if (typeof req.body.phone !== 'string' || req.body.phone.trim() === '') {
      return badRequest(res, 'phone must be a non-empty string');
    }

    const role = parseEnum(req.body.role, 'role', OFFICIAL_ROLES);
    if (role.error) {
      return badRequest(res, role.error);
    }

    const { data, error } = await supabase
      .from('officials')
      .insert({
        name: req.body.name.trim(),
        district: req.body.district.trim(),
        role: role.value,
        phone: req.body.phone.trim(),
      })
      .select('*')
      .single();

    if (error) {
      const mapped = mapSupabaseError(error);
      return res.status(mapped.status).json({ error: mapped.message });
    }

    return res.status(201).json(data);
  })
);

module.exports = router;
