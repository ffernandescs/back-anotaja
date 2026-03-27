import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AccessService } from '../access.service';
import { Action, Subject } from '../../ability/types/ability.types';

@Injectable()
export class PermGuard implements CanActivate {
  constructor(private readonly accessService: AccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.sub || !user?.companyId) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Obter action e subject da rota
    const { action, subject } = this.getActionAndSubjectFromRoute(context);
    
    // Verificar permissão do usuário
    const canPerform = await this.accessService.can(
      user.sub,
      user.companyId,
      action,
      subject
    );

    if (!canPerform) {
      throw new ForbiddenException('Usuário não tem permissão para esta ação');
    }

    return true;
  }

  private getActionAndSubjectFromRoute(context: ExecutionContext): { action: Action; subject: Subject } {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const route = request.route?.path || '';
    
    // Determinar action baseado no método HTTP
    let action: Action;
    switch (method) {
      case 'POST':
        action = Action.CREATE;
        break;
      case 'GET':
        action = Action.READ;
        break;
      case 'PATCH':
      case 'PUT':
        action = Action.UPDATE;
        break;
      case 'DELETE':
        action = Action.DELETE;
        break;
      default:
        action = Action.READ;
    }

    // Determinar subject baseado na rota
    let subject: Subject = Subject.ALL; // Valor padrão
    
    const routeToSubject: Record<string, Subject> = {
      '/orders': Subject.ORDER,
      '/products': Subject.PRODUCT,
      '/categories': Subject.CATEGORY,
      '/complements': Subject.COMPLEMENT,
      '/customers': Subject.CUSTOMER,
      '/dashboard': Subject.DASHBOARD,
      '/profile': Subject.PROFILE,
      '/hours': Subject.HOURS,
      '/payment': Subject.PAYMENT,
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

    for (const [routePattern, subjectValue] of Object.entries(routeToSubject)) {
      if (route.includes(routePattern)) {
        subject = subjectValue;
        break;
      }
    }

    // Se não encontrar, usar ALL
    if (!subject) {
      subject = Subject.ALL;
    }

    return { action, subject };
  }
}
