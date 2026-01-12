// utils/money.ts
export const money = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
