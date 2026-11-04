# Google address test — preparation

Status: server-side adapter and isolated mocked tests only. Not integrated into the Worker or conversation. No live Google request has been made. Production remains unchanged.

Run: `node tests/google-geocoding.mjs`.

## Activation requirements

- A Google Cloud project with billing and Geocoding API enabled.
- A dedicated key restricted to Geocoding API, installed as a server secret `GOOGLE_MAPS_API_KEY`, never in frontend code, localStorage, Git or chat.
- Google Cloud request quotas set before activation. Budget alerts alone do not stop billing.
- Authenticated Worker route with an atomic persistent test budget (proposed starting limit: 10 calls per day and 100 per month for the entire application). `reserveCall` must fail closed if quota storage is unavailable; failed requests also consume budget.

## Remaining integration

1. Bundle the adapter into the Worker and expose an authenticated address lookup operation, independent from OpenAI interpretation and its quota.
2. Call it with the location extracted from text or speech, only after explicit user action for initial testing. Never use fabricated or fallback locations on provider failure.
3. Display candidates with Google Maps attribution and ask the user to choose/confirm. A street-level result must not be presented as a building match; a partial match needs particular attention.
4. Keep responses transient. Do not persist provider address/coordinate data until applicable storage terms have been checked. Place IDs have separate retention rules.
5. After UI integration, test complete text and audio Worker → frontend → next-turn confirmation/correction flows. Preserve the current final event approval.
6. Deploy the matching Worker before enabling the frontend feature. Test with `Wyszogrodzka, Warszawa`, a numbered address, an ambiguous address, and a nonexistent address against the real API.

Business and point-of-interest searches need a separate Places integration; this adapter only handles addresses. Routes and travel time are also outside this first address test.

References:
- https://developers.google.com/maps/documentation/geocoding/requests-geocoding
- https://developers.google.com/maps/documentation/geocoding/usage-and-billing
- https://developers.google.com/maps/documentation/geocoding/policies
