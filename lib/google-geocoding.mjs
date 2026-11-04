// Server-only adapter. Never send apiKey or the provider URL to the frontend.
export class AddressLookupError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export async function findGoogleAddresses(address, {
  apiKey, reserveCall, fetchImpl = fetch, timeoutMs = 8000,
} = {}) {
  const query = typeof address === 'string' ? address.trim() : '';
  if (!query || query.length > 500) throw new AddressLookupError('invalid_address', 'Podaj ulicę i miejscowość.');
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new AddressLookupError('maps_not_configured', 'Wyszukiwanie Google nie jest jeszcze podłączone.');
  // The caller must reserve a call in a persistent, atomic server-side budget.
  // No in-memory counters, retries, or unmetered fallback provider.
  if (typeof reserveCall !== 'function' || await reserveCall() !== true) {
    throw new AddressLookupError('maps_test_limit', 'Osiągnięto limit testowych wyszukiwań adresów.');
  }
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('language', 'pl');
  url.searchParams.set('key', apiKey.trim());
  let data;
  try {
    const response = await fetchImpl(url, {
      redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error('provider_http_error');
    data = await response.json();
  } catch (_) {
    // Provider exceptions can contain the request URL and its API key.
    throw new AddressLookupError('maps_unavailable', 'Nie udało się sprawdzić adresu w Google. Spróbuj później.');
  }
  if (data?.status === 'ZERO_RESULTS') return { provider: 'google', attribution: 'Google Maps', query, candidates: [], requiresConfirmation: true };
  if (data?.status !== 'OK' || !Array.isArray(data.results)) {
    const limited = ['OVER_QUERY_LIMIT', 'OVER_DAILY_LIMIT'].includes(data?.status);
    throw new AddressLookupError(limited ? 'maps_provider_limit' : 'maps_provider_error', limited ? 'Limit Google został osiągnięty.' : 'Google nie zwróciło wyników. Sprawdź konfigurację usługi.');
  }
  const seen = new Set(), candidates = [];
  for (const result of data.results) {
    const point = result?.geometry?.location;
    if (typeof result.place_id !== 'string' || !result.place_id || seen.has(result.place_id)
      || typeof result.formatted_address !== 'string' || !result.formatted_address
      || !Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)
      || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) continue;
    seen.add(result.place_id);
    const components = Array.isArray(result.address_components) ? result.address_components : [];
    const has = type => components.some(c => Array.isArray(c.types) && c.types.includes(type));
    candidates.push({
      placeId: result.place_id, label: result.formatted_address,
      latitude: point.lat, longitude: point.lng,
      partialMatch: result.partial_match === true,
      precision: has('street_number') ? 'building' : has('route') ? 'street' : 'area',
    });
    if (candidates.length === 5) break;
  }
  // A match is a suggestion, never proof of the user's intended destination.
  return { provider: 'google', attribution: 'Google Maps', query, candidates, requiresConfirmation: true };
}
