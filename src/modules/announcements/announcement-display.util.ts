import type { Announcement } from '@prisma/client';

/**
 * Filtra avisos ativos conforme período, horário e dias da semana configurados no admin.
 */
export function filterActiveAnnouncements(
  announcements: Announcement[],
  now: Date = new Date(),
): Announcement[] {
  const currentDay = now
    .toLocaleDateString('en-US', { weekday: 'long' })
    .toLowerCase();

  return announcements.filter((announcement) => {
    if (!announcement.active) return false;

    if (announcement.displayPeriod) {
      try {
        const rawPeriod: unknown = JSON.parse(announcement.displayPeriod);
        if (rawPeriod && typeof rawPeriod === 'object') {
          const period = rawPeriod as {
            startDate?: string | null;
            endDate?: string | null;
            startTime?: string | null;
            endTime?: string | null;
          };

          const startDate = period.startDate ? new Date(period.startDate) : null;
          const endDate = period.endDate ? new Date(period.endDate) : null;

          if (startDate && now < startDate) return false;
          if (endDate && now > endDate) return false;

          if (period.startTime && period.endTime) {
            const currentTime = now.toTimeString().slice(0, 5);
            if (
              currentTime < period.startTime ||
              currentTime > period.endTime
            ) {
              return false;
            }
          }
        }
      } catch {
        /* ignora JSON inválido */
      }
    }

    if (announcement.displayDays) {
      try {
        const rawDays: unknown = JSON.parse(announcement.displayDays);
        if (
          Array.isArray(rawDays) &&
          rawDays.every((d) => typeof d === 'string')
        ) {
          const days = rawDays as string[];
          if (days.length > 0 && !days.includes(currentDay)) {
            return false;
          }
        }
      } catch {
        /* ignora JSON inválido */
      }
    }

    return true;
  });
}
