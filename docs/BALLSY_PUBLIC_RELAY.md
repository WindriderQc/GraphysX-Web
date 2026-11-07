# Ballsy: durable product hosting

Ballsy's two pages are ordinary entries in the product build: `/ballsy.html` is the
race host and `/ballsy-giant.html` is the invited giant. The VR workshop remains
`/?app=vr-lab`. Publishing these entries uses the existing main deployment, not a
second release system or a persistent Windows preview.

## One existing server, one origin

The existing nginx `/store/` proxy forwards to `graphysx-store` on loopback port
8788 and removes the prefix. `server/scene-store.mjs` mounts the dependency-free
`server/ballsy-http.mjs` handler at `/api/ballsy/`, so the public client uses
`/store/api/ballsy/`. It requires no new service, port, certificate, secret, package
installation, firewall exception or nginx edit. The deployment already packages
all of `server/` and restarts the existing unit when that payload changes.

`scripts/serve-ballsy.mjs` mounts the same handler at `/api/ballsy/` for the local
preview. Its page header identifies that mount. `src/ballsy-link.ts` uses that
header only to select the candidate, then verifies the actual `/status` response
is JSON with schema `ballsy-room/v1`. A static server uses the `/store/` candidate.
HTML fallback with status 200 is not a relay. Both players select the same route;
there is no arbitrary URL setting, cross-origin request or redirect-following.
If discovery is interrupted or fails, a later join/open can try again.
The host's invitation button remains visible even when discovery fails or times
out. It offers an explicit retry instead of requiring the page to reload.

## Game authority is separate from store authority

The handler owns only ephemeral game rooms. It receives no store, database,
filesystem path, store guard or store token. Anonymous visitors may create a room
and share its eight-character invitation code. One host and one giant receive
separate random capabilities, held in browser memory and sent only in the
Authorization header. The room capability cannot read private assets, write a
scene or create an editor session. The store token cannot host a Ballsy room.

The race browser retains simulation authority. The server validates bounded
snapshots and game commands; it cannot execute JavaScript or arbitrary scene API
calls. Hand-joint and headset tracking are not uploaded. The giant's deliberate
game commands contain game coordinates and velocities.

Ballsy is mounted before the store's general CORS and OPTIONS handling. It emits
no cross-origin allow header and rejects an Origin that differs from the actual
public origin. In the store mount only, a TCP peer on loopback may supply nginx's
strictly validated `X-Forwarded-Proto` and `X-Real-IP`. Non-loopback peers and the
private preview cannot influence these values. `X-Forwarded-Host` and forwarding
chains (`X-Forwarded-For`) are never trusted. This assumes local processes on the
store host are trusted; the existing nginx configuration overwrites the accepted
headers. No proxy, listener or CORS configuration is widened.

## Bounds and restart behavior

- Eight rooms per process, expiring five minutes after the host stops publishing.
- Ten create/join attempts per IP per minute, with 120 across the process.
- At most 128 tracked IP buckets, discarded after one minute of inactivity.
- At most 240 requests per IP per second and 1,000 across the process.
- At most 16 concurrent requests per IP and 64 across the process.
- Request bodies: 14,000 bytes normally, 48 KiB for host snapshots, five seconds
  maximum to complete. Rejected bodies close their connection.
- One active giant per room, 25 commands per second, a 32-command queue and 128
  deduplication IDs. Commands are tied to the current round and expire quickly.

These are bounded family-game rooms, not an account system or a large public
matchmaking service. A hostile visitor can still occupy the small room allowance
temporarily. Do not put private information in game snapshots. Quota failures
return 429; private store data is not part of any Ballsy reply.

The feature is permanent; individual rooms are not. Restarting the existing
store service, including a server-code deployment, ends current Ballsy rooms and
editor live sessions. A new invitation is needed afterward. No game-room data is
written to disk and no user-authored scene is deleted by the relay.

A terminal room response (401, 403, 404 or 410) clears the host's displayed code,
stops its poll and asks for **Nouvelle invitation**. Only that user's action
creates another room. Temporary network, 408 and 429 failures keep the code;
after five consecutive failed host polls, automatic attempts stop and
**Réessayer la connexion** resumes that same room. If it expired meanwhile, the
terminal response then asks for a new invitation. Late replies from an older
generation cannot invalidate a current connection.

## Verification

Run these lightweight Node contracts in the checkout:

    node --test test/ballsy-relay.test.mjs test/ballsy-rooms.test.mjs test/ballsy-production-relay.test.mjs test/ballsy-link-routing.test.mjs

They cover the private preview, real HTTP proxy composition with the existing
store, scheme and IP trust, origin rejection, independent capabilities, quota
expiry, body limits and deadlines, same-origin route selection, fake HTML/JSON
discovery and interrupted opens/joins. The proxy test supplies an HTTPS external
scheme over a loopback HTTP hop, like nginx; it does not claim a physical TLS or
Quest test. No production room is created by these tests.

After an authorized deployment, verify `release.json`, the exact built HTML and
assets for both pages, and JSON from `/store/api/ballsy/status`. A 200 response to
a page is insufficient because nginx may serve the index fallback. Local browser
journeys and real-headset acceptance are separate from those HTTP checks.
