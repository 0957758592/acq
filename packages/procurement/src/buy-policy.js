// Per-shop, per-platform BUY POLICY — vendor taxonomy mapping (DATA, not logic).
// Maps our platform name -> the reseller's category id + the group/name filters
// that scope a search to real ACCOUNTS of the wanted kind (e.g. Telegram accounts,
// not "Stars"; real @gmail.com, not .edu). Derived from the live dark.shopping
// taxonomy (category/list + product `group` names), verified by fact. Centralized
// so selection stays generic; every field is overridable per call via shop.buy args.
export const BUY_POLICY = {
  'dark.shopping': {
    linkedin: { categoryId: 69 },
    instagram: { categoryId: 30 },
    tiktok: { categoryId: 33 },
    facebook: { categoryId: 31 },
    discord: { categoryId: 68 },
    google: { categoryId: 32 },
    vkontakte: { categoryId: 29 },
    twitter: { categoryId: 42 },
    // Telegram category mixes accounts with Stars/Software/Channels/services —
    // scope to account groups by excluding the non-account group names.
    telegram: {
      categoryId: 43,
      excludeGroups: ['stars', 'software', 'канал', 'групп', 'чат', 'подарок', 'подписчик', 'просмотр', 'реакц', 'премиум', 'boost', 'bot', 'накрут']
    },
    // Gmail category includes .edu / non-@gmail.com domains — keep real @gmail.com.
    // Gmail accounts are not country-tagged, so the country filter is ignored.
    gmail: { categoryId: 129, excludeNames: ['edu', 'not @gmail'], ignoreCountry: true }
  }
};

export function buyPolicyFor(shopId, platform) {
  return (BUY_POLICY[shopId] ?? {})[platform] ?? {};
}
