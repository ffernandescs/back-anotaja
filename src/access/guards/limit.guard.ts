import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AccessService } from '../access.service';
import { Subject } from '../../ability/types/ability.types';

@Injectable()
export class LimitGuard implements CanActivate {
  constructor(private readonly accessService: AccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.sub || !user?.companyId) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Obter subject da rota
    const subject = this.getSubjectFromRoute(context);
    
    // Verificar se é um recurso que tem controle de limite
    if (!this.isResourceLimited(subject)) {
      return true; // Não precisa verificar limite
    }

    // Determinar o recurso baseado no subject
    const resource = this.getResourceForSubject(subject);
    
    // Verificar se empresa está dentro dos limites
    const withinLimit = await this.accessService.withinLimit(
      user.companyId,
      resource
    );

    if (!withinLimit) {
      throw new ForbiddenException('Limite do plano excedido');
    }

    return true;
  }

  private getSubjectFromRoute(context: ExecutionContext): Subject {
    const request = context.switchToHttp().getRequest();
    const route = request.route?.path || '';
    
    // Mapeamento de rotas para subjects
    const routeToSubject: Record<string, Subject> = {
      '/orders': Subject.ORDER,
      '/products': Subject.PRODUCT,
      '/users': Subject.USER,
      '/branches': Subject.BRANCH,
      '/delivery/persons': Subject.DELIVERY_PERSON,
    };

    for (const [routePattern, subject] of Object.entries(routeToSubject)) {
      if (route.includes(routePattern)) {
        return subject;
      }
    }

    return Subject.ALL;
  }

  private isResourceLimited(subject: Subject): boolean {
    const limitedSubjects = [
      Subject.USER,
      Subject.PRODUCT,
      Subject.BRANCH,
      Subject.ORDER,
      Subject.DELIVERY_PERSON
    ];

    return limitedSubjects.includes(subject);
  }

  private getResourceForSubject(subject: Subject): string {
    const mapping: Record<string, string> = {
      [Subject.USER]: 'users',
      [Subject.PRODUCT]: 'products',
      [Subject.BRANCH]: 'branches',
      [Subject.ORDER]: 'ordersPerMonth',
      [Subject.DELIVERY_PERSON]: 'deliveryPersons'
    };

    return mapping[subject] || 'unknown';
  }
}
