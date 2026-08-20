const express = require('express');
const supabase = require('../supabaseClient');
const asyncHandler = require('../middleware/asyncHandler');
const { verifySubmissionLocation } = require('../verifySubmission');
const {
  SUBMISSION_REVIEW_STATUSES,
  badRequest,
  notFound,
  requireFields,
  parseUuid,
  parseNumber,
  parseEnum,
  parseIsoTimestamp,
  mapSupabaseError,
} = require('../utils/validation');

const router = express.Router();

const SUBMISSION_STATUSES = ['pending_review', 'auto_flagged', 'approved', 'rejected'];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    let query = supabase.from('submissions').select('*').order('submitted_at', {
      ascending: false,
    });

    if (req.query.contract_id !== undefined) {
      const contractId = parseUuid(req.query.contract_id, 'contract_id');
      if (contractId.error) {
        return badRequest(res, contractId.error);
      }
      query = query.eq('contract_id', contractId.value);
    }

    if (req.query.status !== undefined) {
      const status = parseEnum(req.query.status, 'status', SUBMISSION_STATUSES);
      if (status.error) {
        return badRequest(res, status.error);
      }
      query = query.eq('status', status.value);
    }

    const { data, error } = await query;

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
    const missing = requireFields(req.body, [
      'contract_id',
      'vendor_id',
      'photo_url',
      'captured_lat',
      'captured_lng',
      'gps_accuracy_meters',
      'captured_at',
    ]);
    if (missing) {
      return badRequest(res, missing);
    }

    const contractId = parseUuid(req.body.contract_id, 'contract_id');
    if (contractId.error) {
      return badRequest(res, contractId.error);
    }

    const vendorId = parseUuid(req.body.vendor_id, 'vendor_id');
    if (vendorId.error) {
      return badRequest(res, vendorId.error);
    }

    if (typeof req.body.photo_url !== 'string' || req.body.photo_url.trim() === '') {
      return badRequest(res, 'photo_url must be a non-empty string');
    }

    const capturedLat = parseNumber(req.body.captured_lat, 'captured_lat', {
      min: -90,
      max: 90,
    });
    if (capturedLat.error) {
      return badRequest(res, capturedLat.error);
    }

    const capturedLng = parseNumber(req.body.captured_lng, 'captured_lng', {
      min: -180,
      max: 180,
    });
    if (capturedLng.error) {
      return badRequest(res, capturedLng.error);
    }

    const gpsAccuracy = parseNumber(req.body.gps_accuracy_meters, 'gps_accuracy_meters', {
      min: 0,
    });
    if (gpsAccuracy.error) {
      return badRequest(res, gpsAccuracy.error);
    }

    const capturedAt = parseIsoTimestamp(req.body.captured_at, 'captured_at');
    if (capturedAt.error) {
      return badRequest(res, capturedAt.error);
    }

    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId.value)
      .maybeSingle();

    if (contractError) {
      const mapped = mapSupabaseError(contractError);
      return res.status(mapped.status).json({ error: mapped.message });
    }

    if (!contract) {
      return notFound(res, 'Contract not found');
    }

    if (contract.assigned_vendor_id !== vendorId.value) {
      return badRequest(
        res,
        'vendor_id does not match the vendor assigned to this contract'
      );
    }

    const verification = verifySubmissionLocation({
      capturedLat: capturedLat.value,
      capturedLng: capturedLng.value,
      gpsAccuracyMeters: gpsAccuracy.value,
      siteLatitude: Number(contract.site_latitude),
      siteLongitude: Number(contract.site_longitude),
      siteRadiusMeters: contract.site_radius_meters,
    });

    const { data: submission, error: insertError } = await supabase
      .from('submissions')
      .insert({
        contract_id: contractId.value,
        vendor_id: vendorId.value,
        photo_url: req.body.photo_url.trim(),
        captured_lat: capturedLat.value,
        captured_lng: capturedLng.value,
        gps_accuracy_meters: gpsAccuracy.value,
        captured_at: capturedAt.value,
        distance_from_site_m: verification.distanceFromSiteM,
        status: verification.status,
        flag_reason: verification.flagReason,
      })
      .select('*')
      .single();

    if (insertError) {
      const mapped = mapSupabaseError(insertError);
      return res.status(mapped.status).json({ error: mapped.message });
    }

    // Contract moves to "submitted" once proof is uploaded (regardless of auto-flag).
    const { error: contractUpdateError } = await supabase
      .from('contracts')
      .update({ status: 'submitted' })
      .eq('id', contractId.value);

    if (contractUpdateError) {
      const mapped = mapSupabaseError(contractUpdateError);
      return res.status(mapped.status).json({ error: mapped.message });
    }

    return res.status(201).json(submission);
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const idResult = parseUuid(req.params.id, 'id');
    if (idResult.error) {
      return badRequest(res, idResult.error);
    }

    const missing = requireFields(req.body, ['status', 'reviewed_by']);
    if (missing) {
      return badRequest(res, missing);
    }

    const status = parseEnum(req.body.status, 'status', SUBMISSION_REVIEW_STATUSES);
    if (status.error) {
      return badRequest(res, status.error);
    }

    const reviewedBy = parseUuid(req.body.reviewed_by, 'reviewed_by');
    if (reviewedBy.error) {
      return badRequest(res, reviewedBy.error);
    }

    if (
      req.body.review_notes !== undefined &&
      req.body.review_notes !== null &&
      typeof req.body.review_notes !== 'string'
    ) {
      return badRequest(res, 'review_notes must be a string when provided');
    }

    const { data: existing, error: fetchError } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', idResult.value)
      .maybeSingle();

    if (fetchError) {
      const mapped = mapSupabaseError(fetchError);
      return res.status(mapped.status).json({ error: mapped.message });
    }

    if (!existing) {
      return notFound(res, 'Submission not found');
    }

    const { data: official, error: officialError } = await supabase
      .from('officials')
      .select('id')
      .eq('id', reviewedBy.value)
      .maybeSingle();

    if (officialError) {
      const mapped = mapSupabaseError(officialError);
      return res.status(mapped.status).json({ error: mapped.message });
    }

    if (!official) {
      return badRequest(res, 'reviewed_by official does not exist');
    }

    const reviewedAt = new Date().toISOString();

    const { data: updatedSubmission, error: updateError } = await supabase
      .from('submissions')
      .update({
        status: status.value,
        reviewed_by: reviewedBy.value,
        review_notes: req.body.review_notes ?? null,
        reviewed_at: reviewedAt,
      })
      .eq('id', idResult.value)
      .select('*')
      .single();

    if (updateError) {
      const mapped = mapSupabaseError(updateError);
      return res.status(mapped.status).json({ error: mapped.message });
    }

    const { error: contractUpdateError } = await supabase
      .from('contracts')
      .update({ status: status.value })
      .eq('id', existing.contract_id);

    if (contractUpdateError) {
      const mapped = mapSupabaseError(contractUpdateError);
      return res.status(mapped.status).json({ error: mapped.message });
    }

    return res.json(updatedSubmission);
  })
);

module.exports = router;
