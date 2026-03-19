/**
 * Geoblocking for prediction market compliance.
 *
 * Per DFlow/Kalshi compliance requirements, prediction market trading
 * must be blocked from the United States and other restricted jurisdictions.
 *
 * This is enforced at the application level — KYC (Proof) verifies identity
 * but does NOT replace jurisdictional restrictions.
 *
 * See: https://pond.dflow.net/legal/prediction-market-compliance
 */

// ISO 3166-1 alpha-2 country codes for restricted jurisdictions
export const RESTRICTED_COUNTRIES = new Set([
  "US", // United States
  "AF", // Afghanistan
  "DZ", // Algeria
  "AO", // Angola
  "AU", // Australia
  "BY", // Belarus
  "BE", // Belgium
  "BO", // Bolivia
  "BG", // Bulgaria
  "BF", // Burkina Faso
  "CM", // Cameroon
  "CA", // Canada
  "CF", // Central African Republic
  "CI", // Côte d'Ivoire
  "CU", // Cuba
  "CD", // Democratic Republic of the Congo
  "ET", // Ethiopia
  "FR", // France
  "HT", // Haiti
  "IR", // Iran
  "IQ", // Iraq
  "IT", // Italy
  "KE", // Kenya
  "LA", // Laos
  "LB", // Lebanon
  "LY", // Libya
  "ML", // Mali
  "MC", // Monaco
  "MZ", // Mozambique
  "MM", // Myanmar (Burma)
  "NA", // Namibia
  "NI", // Nicaragua
  "NE", // Niger
  "KP", // North Korea
  "CN", // People's Republic of China
  "PL", // Poland
  "RU", // Russia
  "SG", // Singapore
  "SO", // Somalia
  "SS", // South Sudan
  "SD", // Sudan
  "CH", // Switzerland
  "SY", // Syria
  "TW", // Taiwan
  "TH", // Thailand
  "UA", // Ukraine
  "AE", // United Arab Emirates
  "GB", // United Kingdom
  "VE", // Venezuela
  "YE", // Yemen
  "ZW", // Zimbabwe
]);

// Country names for display
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  CN: "China",
  RU: "Russia",
  FR: "France",
  DE: "Germany",
  IT: "Italy",
  // Add more as needed for user-facing messages
};

export type GeoCheckResult = {
  allowed: boolean;
  country: string | null;
  countryName: string | null;
};

/**
 * Check if the user's location is allowed for prediction market trading.
 *
 * Uses a lightweight IP geolocation API. Returns allowed=true if we
 * can't determine location (fail-open for UX, but backend should
 * also enforce).
 */
export async function checkGeoRestriction(): Promise<GeoCheckResult> {
  try {
    // Use a free, no-key-required geolocation API
    const response = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      // Can't determine location — fail open (backend will enforce)
      return { allowed: true, country: null, countryName: null };
    }

    const data = await response.json();
    const countryCode = data.country_code?.toUpperCase();

    if (!countryCode) {
      return { allowed: true, country: null, countryName: null };
    }

    const isRestricted = RESTRICTED_COUNTRIES.has(countryCode);
    const countryName = COUNTRY_NAMES[countryCode] || data.country_name || countryCode;

    return {
      allowed: !isRestricted,
      country: countryCode,
      countryName,
    };
  } catch {
    // Network error, timeout, etc. — fail open
    return { allowed: true, country: null, countryName: null };
  }
}

/**
 * Check if a country code is restricted.
 */
export function isCountryRestricted(countryCode: string): boolean {
  return RESTRICTED_COUNTRIES.has(countryCode.toUpperCase());
}
