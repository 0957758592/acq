// createDuoplusDeviceRegistrationAdapter — implements the domain
// DeviceRegistrationPort ({ ensureReady(device) }) over an injected DuoplusClient.
//
// ensureReady is idempotent: it installs the WhatsApp team-APK only when it is
// not already present on the cloud phone, then (if configured) wires the
// device's proxy. The WhatsApp APK is NOT in the DuoPlus PUBLIC catalog — it
// must come from the TEAM catalog (client.listTeamApps), which is why
// resolveTeamAppId reads there.
//
// Proxy provisioning goes through client.setSmartIp(providerDeviceId, proxy),
// which builds the DuoPlus initProxy payload correctly — each `images` entry
// must be an object { image_id, ip_scan_channel, proxy }, NOT a bare id string.
// It requires config.proxy ({ host, port, user/username, password } or { id });
// when config.proxy is absent, proxy provisioning is skipped entirely (the
// Plan 5 composition supplies it). We never call client.initProxy directly:
// initProxy([id]) would post a malformed { images: [id] } that silently fails
// to provision a proxy.
//
// The `client` (and, in Plan 5, its underlying provider) is INJECTED — this
// module never imports @acq/device-control.
import { domainError } from '@acq/whatsapp';

// Stable, well-known Android package id for WhatsApp.
const WHATSAPP_PACKAGE = 'com.whatsapp';

// Normalizes the three response envelopes DuoPlus is known to use in the wild:
// a bare array, `{ data: [...] }`, or `{ apps: [...] }`. Anything else -> [].
function toList(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.apps)) return response.apps;
  return [];
}

// PROVISIONAL external-shape seam — VERIFY against a real DuoPlus
// /app/installedList response at go-live. Fail-safe: an unrecognized envelope
// normalizes to [] here, so WhatsApp reads as NOT installed and we attempt a
// (possibly redundant) install — a missing WhatsApp is a harder failure than a
// redundant install.
function isWhatsappInstalled(response) {
  return toList(response).some(
    (a) => (typeof a === 'string' ? a : (a?.packageName ?? a?.package ?? '')) === WHATSAPP_PACKAGE
  );
}

// PROVISIONAL external-shape seam — VERIFY against a real DuoPlus /app/teamList
// response at go-live. Matches by package id substring or a name containing
// "whatsapp", then reads the app id under either `appId` or `id`. Returns null
// when nothing matches so the caller can raise WHATSAPP_TEAM_APP_NOT_FOUND.
async function resolveTeamAppId(client) {
  const list = toList(await client.listTeamApps());
  const match = list.find(
    (a) =>
      String(a?.packageName ?? a?.package ?? '').includes('whatsapp') ||
      String(a?.name ?? '').toLowerCase().includes('whatsapp')
  );
  return match?.appId ?? match?.id ?? null;
}

export function createDuoplusDeviceRegistrationAdapter({ client, config = {} }) {
  return {
    async ensureReady(device) {
      const id = device.providerDeviceId;

      const installed = await client.listInstalledApps(id);
      if (!isWhatsappInstalled(installed)) {
        const appId = config.whatsappTeamAppId || (await resolveTeamAppId(client));
        if (!appId) {
          throw domainError(
            'WHATSAPP_TEAM_APP_NOT_FOUND',
            'WhatsApp team-APK not found in the DuoPlus team catalog'
          );
        }
        await client.installApp([id], appId);
      }

      // Proxy provisioning requires config.proxy; skip when absent (do NOT send
      // a malformed initProxy call). setSmartIp builds the correct payload.
      if (config.proxy) {
        await client.setSmartIp(id, config.proxy);
      }
    }
  };
}
