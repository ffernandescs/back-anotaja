/**
 * Interpreta horários tipo BranchSchedule (`day`, `open`, `close`, `closed`, `date`) para mensagens CRM.
 * Fuso padronizado: America/Sao_Paulo (alinhado a `validateBranchOpeningHours` no store).
 */

export interface BranchScheduleLike {
  day: string;
  open: string;
  close: string;
  closed: boolean;
  date: Date | null;
}

const WEEK_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const DAY_PT: Record<(typeof WEEK_ORDER)[number], string> = {
  monday: 'Segunda-feira',
  tuesday: 'Terça-feira',
  wednesday: 'Quarta-feira',
  thursday: 'Quinta-feira',
  friday: 'Sexta-feira',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

/** Espelho de `daysOfWeek` em `validateBranchOpeningHours` (store). */
export function getNowInSaoPaulo(): Date {
  const s = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  return new Date(s);
}

function pad2(n: number): string {
  return `${n}`.padStart(2, '0');
}

function calendarMatchSp(a: Date, b: Date): boolean {
  const da = `${a.toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo' })}`;
  const db = `${b.toLocaleDateString('en-US', { timeZone: 'America/Sao_Paulo' })}`;
  return da === db;
}

/**
 * Agenda de hoje: exceção com `date` ou linha semanal pelo dia da semana (lowercase inglês).
 */
export function resolveTodaySchedule(
  schedules: BranchScheduleLike[],
  refInSaoPaulo: Date,
): BranchScheduleLike | null {
  if (schedules.length === 0) return null;
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const currentDay = daysOfWeek[refInSaoPaulo.getDay()];
  const withDateToday = schedules.find(
    (h) =>
      !!h.date && calendarMatchSp(h.date instanceof Date ? h.date : new Date(h.date), refInSaoPaulo),
  );
  if (withDateToday) return withDateToday;
  return schedules.find((h) => h.day === currentDay && !h.date) ?? schedules.find((h) => h.day === currentDay) ?? null;
}

/** Lista legível das janelas semanais (sem entradas `date`). */
export function formatWeeklyOpeningHoursBulletPt(schedules: BranchScheduleLike[]): string {
  const weekly = schedules.filter((s) => s.date == null);
  if (weekly.length === 0) return '';

  const lines: string[] = [];

  for (const wd of WEEK_ORDER) {
    const row = weekly.find((s) => s.day.toLowerCase() === wd);
    if (!row) continue;
    const label = DAY_PT[wd];
    if (row.closed) {
      lines.push(`• ${label}: fechado`);
    } else {
      lines.push(`• ${label}: ${row.open} às ${row.close}`);
    }
  }

  for (const row of weekly) {
    const d = row.day.toLowerCase();
    if (WEEK_ORDER.includes(d as (typeof WEEK_ORDER)[number])) continue;
    if (row.closed) lines.push(`• ${row.day}: fechado`);
    else lines.push(`• ${row.day}: ${row.open} às ${row.close}`);
  }

  return lines.join('\n').trim();
}

/** Exceções com data específica (ex.: feriado). */
export function formatDateExceptionLinesPt(schedules: BranchScheduleLike[]): string {
  const exceptions = schedules
    .filter((s): s is BranchScheduleLike & { date: Date } => s.date != null)
    .slice()
    .sort((a, b) => (+new Date(a.date) || 0) - (+new Date(b.date) || 0));

  if (exceptions.length === 0) return '';

  const lines: string[] = [];
  for (const ex of exceptions) {
    const d = ex.date instanceof Date ? ex.date : new Date(ex.date);
    const dateLabel =
      `${d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' })}`;
    if (ex.closed) {
      lines.push(`• ${dateLabel}: fechado`);
    } else {
      lines.push(`• ${dateLabel}: ${ex.open} às ${ex.close}`);
    }
  }
  return lines.join('\n').trim();
}

/**
 * Texto combinado para `{{horarios_filial}}`: exceções primeiro, depois grade semanal.
 */
export function buildBranchOpeningHoursBlockPt(schedules: BranchScheduleLike[]): string {
  if (schedules.length === 0) {
    return 'Horários ainda não cadastrados nesta filial (configure na agenda da loja).';
  }

  const ex = formatDateExceptionLinesPt(schedules);
  const weekly = formatWeeklyOpeningHoursBulletPt(schedules);
  const parts = [weekly && `Por dia:\n${weekly}`, ex && `Datas especiais:\n${ex}`].filter(Boolean);
  return parts.join('\n\n').trim() || 'Consulte horários atualizados com a loja.';
}

/**
 * Frase curta com base em horário efetivo hoje (+ flag manual `Branch.isOpen`).
 */
export function buildBranchOpenStatusLinePt(opts: {
  branchIsOpen: boolean;
  schedules: BranchScheduleLike[];
  /** `getNowInSaoPaulo()` */
  refInSaoPaulo: Date;
}): string {
  const { branchIsOpen, schedules, refInSaoPaulo } = opts;

  if (!branchIsOpen) {
    return 'No momento esta filial está marcada como fechada no painel (loja/fechamentos). Quando voltar ao normal, esse status é atualizado automaticamente pelo horário cadastrado.';
  }

  if (schedules.length === 0) {
    return 'Horários da filial não estão cadastrados no sistema.';
  }

  const today = resolveTodaySchedule(schedules, refInSaoPaulo);
  if (!today) {
    return 'Não há horário cadastrado para o dia de hoje nesta filial.';
  }

  if (today.closed) {
    return 'Hoje estamos fechados conforme cadastro.';
  }

  const currentTime = `${pad2(refInSaoPaulo.getHours())}:${pad2(refInSaoPaulo.getMinutes())}`;

  if (currentTime < today.open) {
    return `Ainda não abrimos para hoje. Abrimos às ${today.open} até ${today.close}.`;
  }

  if (currentTime > today.close) {
    return `Para hoje já encerramos (${today.open} às ${today.close}).`;
  }

  return `Estamos dentro do horário de atendimento de hoje (${today.open} às ${today.close}).`;
}
