// utils/phoneFormatter.ts
export function formatPhone(value: string): string {
  // Remove tudo que não é número
  const digits = value.replace(/\D/g, '').slice(0, 11); // Limita a 11 dígitos

  if (digits.length <= 10) {
    // Formato (00) 0000-0000
    return digits.replace(/^(\d{2})(\d{0,4})(\d{0,4})/, (_, d1, d2, d3) =>
      d3 ? `(${d1}) ${d2}-${d3}` : d2 ? `(${d1}) ${d2}` : d1 ? `(${d1}` : '',
    );
  } else {
    // Formato (00) 00000-0000
    return digits.replace(/^(\d{2})(\d{0,5})(\d{0,4})/, (_, d1, d2, d3) =>
      d3 ? `(${d1}) ${d2}-${d3}` : d2 ? `(${d1}) ${d2}` : d1 ? `(${d1}` : '',
    );
  }
}
