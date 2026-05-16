import { prisma } from '../../lib/prisma';

export interface BranchAddressLike {
  street: string;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string;
  state: string;
  zipCode: string;
  reference: string | null;
}

function formatZipCode(zip: string): string {
  const digits = `${zip}`.replace(/\D/g, '');
  if (digits.length === 8) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${zip}`.trim();
}

/** Endereço em linhas para WhatsApp (`{{endereco_filial}}`). */
export function formatBranchAddressBlock(
  addr: BranchAddressLike,
  branchName?: string | null,
): string {
  const streetLine = [addr.street, addr.number].filter(Boolean).join(', ');
  let line1 = streetLine;
  if (addr.complement?.trim()) {
    line1 = `${line1} — ${addr.complement.trim()}`;
  }

  const cityState = `${addr.city}/${addr.state}`.trim();
  const line2 = [addr.neighborhood?.trim(), cityState].filter(Boolean).join(' — ');

  const lines: string[] = [];
  const name = `${branchName ?? ''}`.trim();
  if (name) lines.push(`*${name}*`);

  if (line1) lines.push(line1);
  if (line2) lines.push(line2);

  const cep = formatZipCode(addr.zipCode);
  if (cep) lines.push(`CEP ${cep}`);

  if (addr.reference?.trim()) {
    lines.push(`Referência: ${addr.reference.trim()}`);
  }

  return lines.join('\n');
}

const ADDRESS_NOT_CONFIGURED =
  'Endereço ainda não cadastrado para esta unidade. Entre em contato conosco para mais informações.';

/** Carrega e formata o endereço da filial para mensagens CRM. */
export async function resolveBranchAddressFormatted(branchId: string): Promise<string> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      branchName: true,
      addressId: true,
    },
  });

  if (!branch?.addressId) return ADDRESS_NOT_CONFIGURED;

  const addr = await prisma.branchAddress.findUnique({
    where: { id: branch.addressId },
    select: {
      street: true,
      number: true,
      complement: true,
      neighborhood: true,
      city: true,
      state: true,
      zipCode: true,
      reference: true,
    },
  });

  if (!addr) return ADDRESS_NOT_CONFIGURED;

  return formatBranchAddressBlock(addr, branch.branchName);
}
