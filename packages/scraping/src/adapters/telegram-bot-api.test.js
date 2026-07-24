import { createTelegramBotApiEndpoints } from './telegram-bot-api.js';

const reg = createTelegramBotApiEndpoints({ botToken: 'TESTTOKEN' });
const tg = reg.forPlatform('telegram');

describe('createTelegramBotApiEndpoints (api-tier registry for Telegram)', () => {
  it('serves only telegram', () => {
    expect(reg.forPlatform('instagram')).toBeNull();
    expect(tg).not.toBeNull();
  });

  it('requires a bot token', () => {
    expect(() => createTelegramBotApiEndpoints({})).toThrow(/botToken/);
  });

  it('resolveEndpoint: messages → getUpdates, participants/members → getChatAdministrators', () => {
    expect(tg.resolveEndpoint({ targetType: 'messages', target: 'grp' })).toContain('/botTESTTOKEN/getUpdates');
    expect(tg.resolveEndpoint({ targetType: 'participants', target: '@grp' })).toContain('/getChatAdministrators?chat_id=%40grp');
    expect(tg.resolveEndpoint({ targetType: 'members', target: '123' })).toContain('/getChatAdministrators?chat_id=123');
  });

  it('resolveEndpoint rejects an unsupported target type', () => {
    try {
      tg.resolveEndpoint({ targetType: 'stories', target: 'g' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('SCRAPE_TARGET_UNSUPPORTED');
    }
  });

  it('pickItems messages: maps getUpdates → {id,text,author,ts}, filtered to the target chat', () => {
    const json = {
      ok: true,
      result: [
        { update_id: 1, message: { message_id: 5, text: 'hi', from: { username: 'ann' }, date: 100, chat: { username: 'grp' } } },
        { update_id: 2, message: { message_id: 6, text: 'elsewhere', from: { username: 'x' }, date: 101, chat: { username: 'other' } } },
        { update_id: 3, channel_post: { message_id: 7, text: 'post', from: { first_name: 'Bo' }, date: 102, chat: { title: 'grp' } } }
      ]
    };
    const items = tg.pickItems(json, { targetType: 'messages', target: 'grp' });
    expect(items).toEqual([
      { id: 5, text: 'hi', author: 'ann', ts: 100 },
      { id: 7, text: 'post', author: 'Bo', ts: 102 }
    ]);
  });

  it('pickItems participants: maps getChatAdministrators → {handle, role}', () => {
    const json = { ok: true, result: [{ user: { username: 'ann' }, status: 'administrator' }, { user: { username: 'bob' }, status: 'creator' }] };
    expect(tg.pickItems(json, { targetType: 'participants', target: 'grp' })).toEqual([
      { handle: 'ann', role: 'administrator' },
      { handle: 'bob', role: 'creator' }
    ]);
  });

  it('a Bot API error response is an honest coded seam (not empty data)', () => {
    try {
      tg.pickItems({ ok: false, description: 'Unauthorized' }, { targetType: 'messages', target: 'g' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.code).toBe('SCRAPE_TARGET_UNAVAILABLE');
    }
  });
});
