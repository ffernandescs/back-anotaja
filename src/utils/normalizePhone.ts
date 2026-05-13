export const normalizePhone = (remoteJid: string): string[] => {
    // Remove o sufixo @s.whatsapp.net ou @g.us
    const number = remoteJid.split('@')[0];

    // Só faz sentido buscar cliente para contatos individuais
    if (remoteJid.endsWith('@g.us')) return [];

    // Remove o 55 do início se houver, para trabalhar com o número limpo
    const withoutCountry = number.startsWith('55') ? number.slice(2) : number;

    // DDD + número sem 9
    const withoutNine =
      withoutCountry.length === 11
        ? withoutCountry.slice(0, 2) + withoutCountry.slice(3) // remove o 9
        : withoutCountry;

    // DDD + número com 9
    const withNine =
      withoutCountry.length === 10
        ? withoutCountry.slice(0, 2) + '9' + withoutCountry.slice(2)
        : withoutCountry;

    // Retorna todas as variações com 55 na frente
    return [
      `55${withoutCountry}`,
      `55${withoutNine}`,
      `55${withNine}`,
      withoutCountry,
      withoutNine,
      withNine,
    ];
  };
