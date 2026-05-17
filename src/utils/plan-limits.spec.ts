import {
  DEFAULT_PLAN_LIMITS,
  getResourceLimitValue,
  isResourceUnlimited,
  parsePlanLimits,
  serializePlanLimits,
} from './plan-limits';

describe('plan-limits', () => {
  it('converte formato legado (-1 = ilimitado)', () => {
    const limits = parsePlanLimits({
      products: 50,
      ordersPerMonth: -1,
    });
    expect(limits.products).toEqual({ unlimited: false, max: 50 });
    expect(limits.ordersPerMonth).toEqual({ unlimited: true, max: 0 });
    expect(isResourceUnlimited(limits, 'ordersPerMonth')).toBe(true);
    expect(getResourceLimitValue(limits, 'ordersPerMonth')).toBe(-1);
  });

  it('mantém formato novo com flags', () => {
    const input = {
      ordersPerMonth: { unlimited: false, max: 5000 },
      products: { unlimited: true, max: 200 },
    };
    const limits = parsePlanLimits(input);
    expect(limits.ordersPerMonth).toEqual({ unlimited: false, max: 5000 });
    expect(limits.products.unlimited).toBe(true);
    const json = serializePlanLimits(limits);
    const again = parsePlanLimits(json);
    expect(again.products.unlimited).toBe(true);
    expect(again.ordersPerMonth.max).toBe(5000);
  });

  it('usa defaults quando vazio', () => {
    const limits = parsePlanLimits(null);
    expect(limits.users.max).toBe(DEFAULT_PLAN_LIMITS.users.max);
  });
});
