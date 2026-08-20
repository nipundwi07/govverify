const express = require('express');
const supabase = require('../supabaseClient');
const asyncHandler = require('../middleware/asyncHandler');
const {
  ASSET_TYPES,
  badRequest,
  notFound,
  requireFields,
  parseUuid,
  parseNumber,
  parseEnum,
  mapSupabaseError,
} = require('../utils/validation');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      const mapped = mapSupabaseError(error);
      return res.status(mapped.status).json({ error: mapped.message });
    }

    return res.json(data);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const idResult = parseUuid(req.params.id, 'id');
    if (idResult.error) {
      return badRequest(res, idResult.error);
    }

    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', idResult.value)
      .maybeSingle();

    if (error) {
      const mapped = mapSupabaseError(error);
      return res.status(mapped.status).json({ error: mapped.message });
    }

    if (!data) {
      return notFound(res, 'Contract not found');
    }

    return res.json(data);
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const missing = requireFields(req.body, [
      'title',
      'asset_type',
      'assigned_vendor_id',
      'site_latitude',
      'site_longitude',
      'site_radius_meters',
      'district',
      'sanctioned_amount',
    ]);
    if (missing) {
      return badRequest(res, missing);
    }

    const vendorId = parseUuid(req.body.assigned_vendor_id, 'assigned_vendor_id');
    if (vendorId.error) {
      return badRequest(res, vendorId.error);
    }

    const assetType = parseEnum(req.body.asset_type, 'asset_type', ASSET_TYPES);
    if (assetType.error) {
      return badRequest(res, assetType.error);
    }

    const siteLatitude = parseNumber(req.body.site_latitude, 'site_latitude', {
      min: -90,
      max: 90,
    });
    if (siteLatitude.error) {
      return badRequest(res, siteLatitude.error);
    }

    const siteLongitude = parseNumber(req.body.site_longitude, 'site_longitude', {
      min: -180,
      max: 180,
    });
    if (siteLongitude.error) {
      return badRequest(res, siteLongitude.error);
    }

    const siteRadius = parseNumber(req.body.site_radius_meters, 'site_radius_meters', {
      min: 1,
      integer: true,
    });
    if (siteRadius.error) {
      return badRequest(res, siteRadius.error);
    }

    const sanctionedAmount = parseNumber(req.body.sanctioned_amount, 'sanctioned_amount', {
      min: 0,
    });
    if (sanctionedAmount.error) {
      return badRequest(res, sanctionedAmount.error);
    }

    if (typeof req.body.title !== 'string' || req.body.title.trim() === '') {
      return badRequest(res, 'title must be a non-empty string');
    }

    if (typeof req.body.district !== 'string' || req.body.district.trim() === '') {
      return badRequest(res, 'district must be a non-empty string');
    }

    // status is derived from submissions — never set directly on create.
    const { data, error } = await supabase
      .from('contracts')
      .insert({
        title: req.body.title.trim(),
        asset_type: assetType.value,
        assigned_vendor_id: vendorId.value,
        site_latitude: siteLatitude.value,
        site_longitude: siteLongitude.value,
        site_radius_meters: siteRadius.value,
        district: req.body.district.trim(),
        sanctioned_amount: sanctionedAmount.value,
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
