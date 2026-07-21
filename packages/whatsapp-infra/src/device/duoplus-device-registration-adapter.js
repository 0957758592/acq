// createDuoplusDeviceRegistrationAdapter — implements the domain
// DeviceRegistrationPort ({ ensureReady(device, platform) }) over an injected
// DuoplusClient.
//
// ensureReady is idempotent: it installs the platform team-APK only when it is
// not already present on the cloud phone, then (if configured) wires the
// device's proxy. The app package for the platform is resolved from
// @acq/platform-registry (TZ §3.6/§5.5) — NOT hardcoded — so the same adapter
// provisions any platform's app. The team-APK is NOT in the DuoPlus PUBLIC
// catalog — it must come from the TEAM catalog (client.listTeamApps), which is
// why resolveTeamAppId reads there.
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
import { resolveAppPackage as registryResolveAppPackage } from '@acq/platform-registry';

const DEFAULT_PLATFORM = 'whatsapp';

// Short, human-readable name segment of an Android package id
// (e.g. 'com.whatsapp' -> 'whatsapp') used for the team-catalog name fallback.
function packageShortName(appPackage) {
  const parts = String(appPackage || '').split('.');
  return parts[parts.length - 1] || '';
}

// Normalizes the three response envelopes DuoPlus is known to use in the wild:
// a bare array, `{ data: [...] }`, or `{ apps: [...] }`. Anything else -> [].
function toList(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.apps)) return response.apps;
  return [];
}

function packageOf(app) {
  return typeof app === 'string' ? app : (app?.packageName ?? app?.package ?? '');
}

// PROVISIONAL external-shape seam — VERIFY against a real DuoPlus
// /app/installedList response at go-live. Fail-safe: an unrecognized envelope
// normalizes to [] here, so the app reads as NOT installed and we attempt a
// (possibly redundant) install — a missing app is a harder failure than a
// redundant install.
function isInstalled(response, appPackage) {
  return toList(response).some((a) => packageOf(a) === appPackage);
}

// PROVISIONAL external-shape seam — VERIFY against a real DuoPlus /app/teamList
// response at go-live. Matches by package id (exact/substring) or a name
// containing the package's short name, then reads the app id under either
// `appId` or `id`. Returns null when nothing matches so the caller can raise
// TEAM_APP_NOT_FOUND.
async function resolveTeamAppId(client, appPackage) {
  const shortName = packageShortName(appPackage).toLowerCase();
  const list = toList(await client.listTeamApps());
  const match = list.find((a) => {
    const pkg = String(packageOf(a));
    return (
      pkg === appPackage ||
      pkg.includes(appPackage) ||
      String(a?.name ?? '').toLowerCase().includes(shortName)
    );
  });
  return match?.appId ?? match?.id ?? null;
}

export function createDuoplusDeviceRegistrationAdapter({
  client,
  config = {},
  resolveAppPackage = registryResolveAppPackage
}) {
  return {
    async ensureReady(device, platform = DEFAULT_PLATFORM) {
      const id = device.providerDeviceId;
      const appPackage = resolveAppPackage(platform);

      const installed = await client.listInstalledApps(id);
      if (!isInstalled(installed, appPackage)) {
        const appId = config.teamAppId || config.whatsappTeamAppId || (await resolveTeamAppId(client, appPackage));
        if (!appId) {
          throw domainError(
            'DEVICE_APP_NOT_FOUND',
            `${platform} team-APK (${appPackage}) not found in the DuoPlus team catalog`
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
