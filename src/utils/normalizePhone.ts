export function normalizeBrazilPhone(raw: string | null | undefined): string {
  if (!raw) return '';

  // pega só números
  let number = String(raw).replace(/\D/g, '');

  // valida mínimo aceitável (Brasil: DDD + número = 10 ou 11)
  if (number.length < 10) return '';

  // remove 55 se vier duplicado
  if (number.startsWith('55') && number.length > 11) {
    number = number.slice(2);
  }

  // agora temos DDD + número local
  if (number.length < 10 || number.length > 11) return '';

  const ddd = number.slice(0, 2);
  let local = number.slice(2);

  // remove ou ajusta 9 dígito
  if (local.length === 9) {
    // ok
  } else if (local.length === 8) {
    // adiciona 9
    local = '9' + local;
  } else if (local.length > 9) {
    return '';
  }

  return `55${ddd}${local}`;
}