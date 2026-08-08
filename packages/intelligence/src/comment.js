// AI comment generation (TZ §9.8 content) — PURE prompt construction for the
// `comment` action: turn a target (its handle/bio/recent-post context) into an
// LLM chat prompt that yields ONE short, authentic, human-sounding comment. The
// actual LLM call stays in the application layer (ctx.llmFor), so this is fully
// testable and deterministic. `extractCompletionText` normalizes the varied
// completion shapes to a trimmed string.

export function buildCommentPrompt({ target = {}, tone = 'friendly', locale = 'en', persona = {} } = {}) {
  const meta = target.metadata ?? {};
  const context = [
    target.identifier ? `Account: ${target.identifier}` : null,
    meta.displayName ? `Name: ${meta.displayName}` : null,
    meta.bio ? `Bio: ${meta.bio}` : null,
    meta.caption ? `Recent post: ${meta.caption}` : null,
    target.platform ? `Platform: ${target.platform}` : null
  ].filter(Boolean).join('\n');

  const voice = persona.name || persona.niche
    ? ` Write in the voice of ${persona.name ?? 'a real user'}${persona.niche ? ` who is into ${persona.niche}` : ''}.`
    : '';

  const system =
    `You write short, authentic, ${tone} social-media comments in ${locale}. ` +
    'One to two sentences, relevant to the context, sound like a real human. ' +
    'No hashtags unless natural, no spammy emojis, never say you are an AI.' + voice;

  const user =
    `Write ONE ${tone} comment to post on this ${target.platform ?? 'social'} ${target.targetType ?? 'account'}:\n` +
    `${context || '(no additional context)'}\n\nReturn only the comment text, nothing else.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

export function extractCompletionText(res) {
  if (!res) return '';
  const raw =
    res.choices?.[0]?.message?.content ??
    res.choices?.[0]?.text ??
    res.text ??
    res.content ??
    res.message?.content ??
    '';
  return String(raw).trim();
}
