import { CashMovementType } from "@prisma/client";

export function computeCashSessionBalance(session: any) {
  let expectedAmount = session.openingAmount;

  let totalSales = 0;
  let totalDeposits = 0;
  let totalWithdrawals = 0;

  let salesByCash = 0;
  let salesByCredit = 0;
  let salesByDebit = 0;
  let salesByPix = 0;
  let salesByOnline = 0;

  for (const movement of session.movements ?? []) {
    if (movement.type === CashMovementType.OPENING) continue;

    if (movement.type === CashMovementType.SALE) {
      totalSales += movement.amount;

      const method = (movement.paymentMethod as string)?.toUpperCase();

      switch (method) {
        case 'CASH':
          salesByCash += movement.amount;
          expectedAmount += movement.amount;
          break;

        case 'CREDIT':
        case 'CREDIT_CARD':
          salesByCredit += movement.amount;
          break;

        case 'DEBIT':
        case 'DEBIT_CARD':
          salesByDebit += movement.amount;
          break;

        case 'PIX':
          salesByPix += movement.amount;
          break;

        case 'ONLINE':
          salesByOnline += movement.amount;
          break;
      }
    }

    if (movement.type === CashMovementType.DEPOSIT) {
      totalDeposits += movement.amount;
      expectedAmount += movement.amount;
    }

    if (movement.type === CashMovementType.WITHDRAWAL) {
      totalWithdrawals += movement.amount;
      expectedAmount -= movement.amount;
    }
  }

  return {
    expectedAmount,
    totalSales,
    totalDeposits,
    totalWithdrawals,
    salesByCash,
    salesByCredit,
    salesByDebit,
    salesByPix,
    salesByOnline,
  };
}