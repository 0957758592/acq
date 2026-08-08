/**
 * ScoringPort (TZ §4/§10.5):
 * @typedef {Object} ScoringPort
 * @property {(input: { subjectType: 'account'|'target', subjectId: string, features: Object }) => Promise<{ score: number, reasons: Object[] }>} score
 */
export { scoreAccount, scoreTarget, selectTopN } from './scoring.js';
export { buildCommentPrompt, extractCompletionText } from './comment.js';
