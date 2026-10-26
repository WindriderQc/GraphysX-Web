/**
 * NetX data source: AgentX Data through the page's own `/diskx-api/network/*` relay, or the
 * synthetic fixture when no relay is configured, the LAN is out of reach, or `?source=fixture`
 * asks. The fixture carries no real address: TEST-NET-1 (192.0.2.0/24) and locally
 * administered MACs, in the proportions of the inventory read on 2026-10-26.
 *
 * Both sources hand back Data's three bodies unchanged (`NetxBodies`); `netx-data.ts` reads
 * them. Nothing here writes: the relay refuses anything but GET.
 */

import fixtureJson from "./netx-fixture.json" with { type: "json" };
import type { NetxAgentsBody, NetxBodies, NetxCapabilityBody, NetxDevicesBody } from "./netx-data";

export type NetxFixture = {
  schema: string;
  synthetic: boolean;
  capturedAt: string;
  source: string;
  devices: NetxDevicesBody;
  agents: NetxAgentsBody;
  capability: NetxCapabilityBody;
};
export const NETX_FIXTURE: NetxFixture = fixtureJson as NetxFixture;

export type NetxSourceKind = "live" | "fixture";
export type NetxSource = {
  kind: NetxSourceKind;
  /** Human label of where the numbers come from. */
  origin: string;
  load: () => Promise<NetxBodies>;
};

export type NetxEndpoints = { devices: string; agents: string; capability: string };
export const RELAY_ENDPOINTS: NetxEndpoints = { devices: "/diskx-api/network/devices", agents: "/diskx-api/network/agents", capability: "/diskx-api/network/capability" };
/** The same reads on an AgentX Core page, which serves the Data Toolbox routes on its own origin. */
export const CORE_ENDPOINTS: NetxEndpoints = { devices: "/api/data-toolbox/network/devices", agents: "/api/data-toolbox/network/agents", capability: "/api/data-toolbox/network/capability" };

type Envelope<T> = { status?: string; ok?: boolean; data?: T; message?: string };
const unwrap = async <T>(response: Response): Promise<T> => {
  if (!response.ok) throw new Error(`NetX: ${response.status}`);
  const payload = (await response.json()) as Envelope<T>;
  if (!payload || payload.data === undefined) throw new Error(payload?.message ?? "NetX: réponse vide");
  return payload.data;
};

export function createFixtureSource(fixture: NetxFixture = NETX_FIXTURE): NetxSource {
  return {
    kind: "fixture",
    origin: `Capture ${fixture.capturedAt.slice(0, 10)} · ${fixture.synthetic ? "synthétique" : fixture.source}`,
    load: async () => ({ devices: fixture.devices, agents: fixture.agents, capability: fixture.capability }),
  };
}

export function createLiveSource(fetchImpl: typeof fetch, origin: string, endpoints: NetxEndpoints = RELAY_ENDPOINTS): NetxSource {
  return {
    kind: "live",
    origin: `AgentX Data · ${origin}`,
    load: async () => {
      // Devices and collectors are the inventory; the capability flag is a detail that may fail alone.
      const [devices, agents, capability] = await Promise.all([
        fetchImpl(endpoints.devices, { cache: "no-store" }).then((response) => unwrap<NetxDevicesBody>(response)),
        fetchImpl(endpoints.agents, { cache: "no-store" }).then((response) => unwrap<NetxAgentsBody>(response)),
        fetchImpl(endpoints.capability, { cache: "no-store" }).then((response) => unwrap<NetxCapabilityBody>(response)).catch(() => null),
      ]);
      return { devices, agents, capability };
    },
  };
}

/**
 * Pick the source for this page. Live needs the relay to say it is configured; anything else —
 * a static deploy with no relay, a 503, a network error — is the fixture, announced as such.
 */
export async function resolveNetxSource(options: { fetchImpl?: typeof fetch; forceFixture?: boolean; fixture?: NetxFixture; requireLive?: boolean } = {}): Promise<NetxSource> {
  const fixture = options.fixture ?? NETX_FIXTURE;
  if (options.forceFixture) return createFixtureSource(fixture);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  try {
    const response = await fetchImpl("/diskx-api/config", { cache: "no-store" });
    if (!response.ok) { if (options.requireLive) throw new Error("Configuration indisponible"); return createFixtureSource(fixture); }
    const config = (await response.json()) as { enabled?: boolean; source?: string | null };
    if (config.enabled !== true) { if (options.requireLive) throw new Error("Source désactivée"); return createFixtureSource(fixture); }
    return createLiveSource(fetchImpl, config.source ?? "LAN");
  } catch (error) {
    if (options.requireLive) throw error;
    return createFixtureSource(fixture);
  }
}
