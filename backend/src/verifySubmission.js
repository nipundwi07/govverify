const EARTH_RADIUS_M = 6371000;
const GPS_ACCURACY_THRESHOLD_M = 50;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lng points on Earth, in meters.
 * Uses the haversine formula (see module README / Step 2 notes for the math).
 */
function haversineDistanceM(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * Naive verification: compare capture point to contract site.
 *
 * @param {object} params
 * @param {number} params.capturedLat
 * @param {number} params.capturedLng
 * @param {number} params.gpsAccuracyMeters - device-reported GPS uncertainty
 * @param {number} params.siteLatitude - contract expected site
 * @param {number} params.siteLongitude
 * @param {number} params.siteRadiusMeters - allowed radius around site
 * @returns {{ distanceFromSiteM: number, status: 'pending_review'|'auto_flagged', flagReason: string|null }}
 */
function verifySubmissionLocation({
  capturedLat,
  capturedLng,
  gpsAccuracyMeters,
  siteLatitude,
  siteLongitude,
  siteRadiusMeters,
}) {
  const distanceFromSiteM = haversineDistanceM(
    capturedLat,
    capturedLng,
    siteLatitude,
    siteLongitude
  );

  const reasons = [];

  if (gpsAccuracyMeters > GPS_ACCURACY_THRESHOLD_M) {
    reasons.push(
      `GPS accuracy (${gpsAccuracyMeters}m) exceeds maximum allowed (${GPS_ACCURACY_THRESHOLD_M}m)`
    );
  }

  if (distanceFromSiteM > siteRadiusMeters) {
    reasons.push(
      `Distance from site (${distanceFromSiteM.toFixed(2)}m) exceeds contract radius (${siteRadiusMeters}m)`
    );
  }

  const status = reasons.length > 0 ? 'auto_flagged' : 'pending_review';

  return {
    distanceFromSiteM: Number(distanceFromSiteM.toFixed(2)),
    status,
    flagReason: reasons.length > 0 ? reasons.join('; ') : null,
  };
}

module.exports = {
  EARTH_RADIUS_M,
  GPS_ACCURACY_THRESHOLD_M,
  haversineDistanceM,
  verifySubmissionLocation,
};
