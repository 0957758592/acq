import { buyAccounts } from '@acq/whatsapp';

export async function buyAccountsHandler(payload, ctx) {
  return buyAccounts({ quantity: payload.quantity }, {
    procurement: ctx.procurement,
    accountRepo: ctx.accountRepo,
    expenseRecorder: ctx.expenseRecorder
  });
}
