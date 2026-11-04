import assert from 'node:assert/strict';
import {findGoogleAddresses} from '../lib/google-geocoding.mjs';

const key = 'test-key-never-live';
let calls = 0, reservations = 0, payload;
const options = {
  apiKey: key,
  reserveCall: async () => { reservations++; return true; },
  fetchImpl: async url => {
    calls++;
    assert.equal(url.origin, 'https://maps.googleapis.com');
    assert.equal(url.searchParams.get('address'), 'Wyszogrodzka, Warszawa');
    return new Response(JSON.stringify(payload));
  },
};
const result = {
  place_id: 'fixture-street', formatted_address: 'Wyszogrodzka, Warszawa, Polska',
  geometry: {location: {lat: 52.28, lng: 21.03}},
  address_components: [{types: ['route']}], partial_match: true,
};
await assert.rejects(findGoogleAddresses('', options), {code: 'invalid_address'});
await assert.rejects(findGoogleAddresses('Warszawa'), {code: 'maps_not_configured'});
await assert.rejects(findGoogleAddresses('Warszawa', {...options, reserveCall: async () => false}), {code: 'maps_test_limit'});
assert.equal(calls, 0);
payload = {status: 'OK', results: [result, result, {...result, place_id: 'bad', geometry: {location: {lat: 200, lng: 21}}}]};
let response = await findGoogleAddresses('Wyszogrodzka, Warszawa', options);
assert.equal(response.candidates.length, 1);
assert.equal(response.candidates[0].precision, 'street');
assert.equal(response.candidates[0].partialMatch, true);
assert.equal(response.requiresConfirmation, true);
assert.equal(response.attribution, 'Google Maps');
assert(!JSON.stringify(response).includes(key));
payload = {status: 'OK', results: [{...result, address_components: [{types: ['street_number']}]}]};
response = await findGoogleAddresses('Wyszogrodzka, Warszawa', options);
assert.equal(response.candidates[0].precision, 'building');
payload = {status: 'ZERO_RESULTS'};
assert.deepEqual((await findGoogleAddresses('Wyszogrodzka, Warszawa', options)).candidates, []);
payload = {status: 'OVER_QUERY_LIMIT', error_message: key};
await assert.rejects(findGoogleAddresses('Wyszogrodzka, Warszawa', options), {code: 'maps_provider_limit'});
await assert.rejects(findGoogleAddresses('Wyszogrodzka, Warszawa', {...options, fetchImpl: async () => {throw Error(key);}}), error => !error.message.includes(key) && error.code === 'maps_unavailable');
assert.equal(calls, 4, 'One provider request per authorized lookup, no automatic retries');
assert.equal(reservations, 5, 'Failed network calls still consume a reservation');
console.log('Google address adapter: street/building distinction, confirmation, deduplication, empty results, limits and secret-safe errors passed (Google responses mocked).');
