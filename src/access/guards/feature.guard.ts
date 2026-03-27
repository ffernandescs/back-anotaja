import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AccessService } from '../access.service';
import { Subject } from '../../ability/types/ability.types';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private readonly accessService: AccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.sub || !user?.companyId) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Obter subject da rota ou decorator
    const subject = this.getSubjectFromRoute(context);
    
    // Verificar se empresa tem a feature necessária
    const hasFeature = await this.accessService.hasFeature(
      user.companyId,
      this.accessService.getFeatureForSubject(subject)
    );

    if (!hasFeature) {
      throw new ForbiddenException('Plano não possui esta feature');
    }

    return true;
  }

  private getSubjectFromRoute(context: ExecutionContext): Subject {
    // Lógica para determinar o subject baseado na rota
    const request = context.switchToHttp().getRequest();
    const route = request.route?.path || '';
    
    // Mapeamento de rotas para subjects
    const routeToSubject: Record<string, Subject> = {
      '/orders': Subject.ORDER,
      '/products': Subject.PRODUCT,
      '/categories': Subject.CATEGORY,
      '/customers': Subject.CUSTOMER,
      '/dashboard': Subject.DASHBOARD,
      '/kanban': Subject.KANBAN,
      '/pdv': Subject.PDV,
      '/kds': Subject.KDS,
      '/commands': Subject.COMMANDS,
      '/reports': Subject.REPORT,
      '/coupons': Subject.COUPON,
      '/delivery/routes': Subject.DELIVERY_ROUTE,
      '/stock': Subject.STOCK,
      '/delivery/areas': Subject.DELIVERY_AREA,
      '/delivery/persons': Subject.DELIVERY_PERSON,
      '/cash-register': Subject.CASH_REGISTER,
      '/tables': Subject.TABLE,
      '/payment-methods': Subject.PAYMENT_METHOD,
      '/points': Subject.POINTS,
      '/announcements': Subject.ANNOUNCEMENT,
      '/groups': Subject.GROUP,
      '/users': Subject.USER,
      '/subscription': Subject.SUBSCRIPTION,
      '/branches': Subject.BRANCH,
    };

    // Encontrar o subject correspondente
    for (const [routePattern, subject] of Object.entries(routeToSubject)) {
      if (route.includes(routePattern)) {
        return subject;
      }
    }

    return Subject.ALL;
  }
}
