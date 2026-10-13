// Assessor code constants for the comps query.
//
// IMPORTANT: every numeric code below must be checked against the King County Assessor's lookup
// tables (the Assessor's "Lookup" extract) before relying on it. v1 deliberately does NOT filter
// on any of them. The comps query uses only:
//   - `sale_warning` being empty (any warning code is treated as "not arm's-length"),
//   - the parcel having exactly one residential building,
//   - `nbr_living_units` matching the subject.
//
// Keep this file as the single place such constants live. Add a code here only with a comment
// naming the lookup row it came from and the date it was verified.

/** Sales are excluded when the warning field has any non-whitespace content. */
export const EXCLUDE_ANY_SALE_WARNING = true;

/** Not applied in v1. Candidates to verify: sale instrument 'Statutory Warranty Deed' (commonly 3). */
export const SALE_INSTRUMENT_FILTER: readonly number[] | null = null;

/** Not applied in v1. Candidates to verify: principal use 'Residential' (commonly 6). */
export const PRINCIPAL_USE_FILTER: readonly number[] | null = null;

/** Not applied in v1. Candidates to verify: property type 'Land with building' (commonly 11). */
export const PROPERTY_TYPE_FILTER: readonly number[] | null = null;

export const MAX_COMPS = 50;
export const MIN_COMPS_FOR_RANGE = 5;
