export function calculateStripeAmount(priceInCents: number, discountPercent: number) {
  const discounted = Math.round(priceInCents * (1 - (discountPercent ?? 0) / 100));
  return discounted; // já em centavos, sem multiplicar por 100
}
