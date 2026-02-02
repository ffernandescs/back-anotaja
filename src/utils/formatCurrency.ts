export function formatCurrency(value: number): string {
  // Se o valor estiver em centavos, converte para reais
  const amountInReais = value / 100;

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amountInReais);
}
