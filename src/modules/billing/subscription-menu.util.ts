import type { SubscriptionStatus } from '@prisma/client';

/** Rotas permitidas no admin quando a assinatura não está operacional. */
export const BILLING_MENU_HREF_PREFIXES = [
  '/admin/administration/settings/subscription',
  '/admin/administration/settings/payments',
] as const;

const BLOCKED_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatus>([
  'CANCELLED',
  'SUSPENDED',
  'PENDING',
  'INACTIVE',
  'EXPIRED',
]);

export type MenuItemDto = {
  id: string;
  label: string;
  icon?: string | null;
  href?: string | null;
  isPlugin?: boolean;
  isPro?: boolean;
  children?: MenuItemDto[];
};

export type MenuGroupDto = {
  title: string;
  items: MenuItemDto[];
};

export function isBillingMenuHref(href?: string | null): boolean {
  if (!href) return false;
  return BILLING_MENU_HREF_PREFIXES.some(
    (prefix) => href === prefix || href.startsWith(`${prefix}/`),
  );
}

export function isTrialExpired(
  planType: string | null | undefined,
  trialEndsAt: Date | null | undefined,
): boolean {
  if (planType !== 'TRIAL' || !trialEndsAt) return false;
  const endUTC = Date.UTC(
    trialEndsAt.getFullYear(),
    trialEndsAt.getMonth(),
    trialEndsAt.getDate(),
  );
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return todayUTC > endUTC;
}

export function shouldRestrictMenuForSubscription(subscription: {
  status: SubscriptionStatus;
  plan?: { type?: string | null } | null;
  trialEndsAt?: Date | null;
} | null): boolean {
  if (!subscription) return true;

  if (subscription.status === 'ACTIVE') {
    if (isTrialExpired(subscription.plan?.type ?? null, subscription.trialEndsAt)) {
      return true;
    }
    return false;
  }

  if (subscription.status === 'GRACE_PERIOD') {
    return false;
  }

  return BLOCKED_SUBSCRIPTION_STATUSES.has(subscription.status);
}

function filterMenuItem(item: MenuItemDto): MenuItemDto | null {
  if (item.children?.length) {
    const children = item.children
      .map((child) => filterMenuItem(child))
      .filter((c): c is MenuItemDto => c !== null);

    if (children.length > 0) {
      return { ...item, children };
    }
    return null;
  }

  return isBillingMenuHref(item.href) ? item : null;
}

export function restrictMenuToBillingAccess(menu: MenuGroupDto[]): MenuGroupDto[] {
  const filtered = menu
    .map((group) => {
      const items = group.items
        .map((item) => filterMenuItem(item))
        .filter((item): item is MenuItemDto => item !== null);

      if (items.length === 0) return null;
      return { ...group, items };
    })
    .filter((group): group is MenuGroupDto => group !== null);

  if (filtered.length > 0) {
    return filtered;
  }

  return [
    {
      title: 'Assinatura',
      items: [
        {
          id: 'subscription-restricted-plans',
          label: 'Planos e assinatura',
          icon: 'CreditCard',
          href: '/admin/administration/settings/subscription',
          isPlugin: false,
          isPro: false,
        },
        {
          id: 'subscription-restricted-payments',
          label: 'Pagamentos',
          icon: 'Wallet',
          href: '/admin/administration/settings/payments',
          isPlugin: false,
          isPro: false,
        },
        {
          id: 'subscription-restricted-history',
          label: 'Histórico de cobrança',
          icon: 'History',
          href: '/admin/administration/settings/subscription/history',
          isPlugin: false,
          isPro: false,
        },
      ],
    },
  ];
}
