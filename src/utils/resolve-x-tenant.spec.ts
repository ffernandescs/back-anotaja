import { resolveXTenant } from './resolve-x-tenant';

describe('resolveXTenant', () => {
  it('trata subdomínio longo caldosdoneguinhoboaviagem como slug, não como branchId', () => {
    expect(resolveXTenant('caldosdoneguinhoboaviagem')).toEqual({
      subdomain: 'caldosdoneguinhoboaviagem',
    });
  });

  it('trata cuid de filial como branchId', () => {
    expect(resolveXTenant('cmp9aveie02ng3ps4f2j9giwe')).toEqual({
      branchId: 'cmp9aveie02ng3ps4f2j9giwe',
    });
  });

  it('trata subdomínios curtos normalmente', () => {
    expect(resolveXTenant('vaidelliboaviagem')).toEqual({
      subdomain: 'vaidelliboaviagem',
    });
  });
});
