import { domainError } from '@acq/engine-domain';

// Telegram Bot API endpoint registry for the api scrape tier (TZ §10.1 T3).
// Plugs into createApiScrapeAdapter({ endpointRegistry }). OPT-IN — the browser
// (web) tier stays the default; a caller selects this by passing
// params.via='bot-api' (routed to the api tier by the ScrapeProvider) against a
// worker configured with a bot token. The fetch/parse mechanism is real; the
// token is injected. Honest Bot-API limits: messages come from getUpdates (what
// the bot has received while in the chat — not arbitrary history), and the user
// roster the Bot API can enumerate is the chat administrators.
function normalizeChatKey(v) {
  return String(v ?? '').replace(/^@/, '').toLowerCase();
}

function matchesChat(chat, target) {
  if (!target) return true;
  const t = normalizeChatKey(target);
  return [chat?.username, chat?.id, chat?.title]
    .filter((v) => v != null)
    .map(normalizeChatKey)
    .includes(t);
}

function authorHandle(from) {
  return from?.username ?? from?.first_name ?? (from?.id != null ? String(from.id) : '');
}

export function createTelegramBotApiEndpoints({ botToken, apiBase = 'https://api.telegram.org' } = {}) {
  if (!botToken) throw new Error('createTelegramBotApiEndpoints requires a botToken');
  const base = `${apiBase}/bot${botToken}`;

  const telegram = {
    resolveEndpoint(req) {
      if (req.targetType === 'messages') return `${base}/getUpdates`;
      if (req.targetType === 'participants' || req.targetType === 'members') {
        return `${base}/getChatAdministrators?chat_id=${encodeURIComponent(req.target)}`;
      }
      throw domainError('SCRAPE_TARGET_UNSUPPORTED', `telegram bot-api has no '${req.targetType}' target`);
    },
    pickItems(json, req) {
      if (json?.ok !== true) {
        throw domainError('SCRAPE_TARGET_UNAVAILABLE', `telegram bot-api: ${json?.description ?? 'request failed'}`);
      }
      const result = json.result ?? [];
      if (req.targetType === 'messages') {
        return result
          .map((u) => u.message ?? u.channel_post)
          .filter(Boolean)
          .filter((m) => matchesChat(m.chat, req.target))
          .map((m) => ({ id: m.message_id, text: m.text ?? m.caption ?? '', author: authorHandle(m.from), ts: m.date }));
      }
      // participants / members → chat administrators the bot can enumerate
      return result.map((a) => ({ handle: a.user?.username ?? (a.user?.id != null ? String(a.user.id) : ''), role: a.status }));
    }
  };

  return {
    forPlatform(platform) {
      return platform === 'telegram' ? telegram : null;
    }
  };
}
