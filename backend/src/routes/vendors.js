const express = require('express');
const supabase = require('../supabaseClient');
const asyncHandler = require('../middleware/asyncHandler');
const {
  badRequest,
  requireFields,
  mapSupabaseError,
} = require('../utils/validation');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('vendors')
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
    const missing = requireFields(req.body, ['name', 'phone']);
    if (missing) {
      return badRequest(res, missing);
    }

    if (typeof req.body.name !== 'string' || req.body.name.trim() === '') {
      return badRequest(res, 'name must be a non-empty string');
    }

    if (typeof req.body.phone !== 'string' || req.body.phone.trim() === '') {
      return badRequest(res, 'phone must be a non-empty string');
    }

    const { data, error } = await supabase
      .from('vendors')
      .insert({
        name: req.body.name.trim(),
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
