import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { CustomersService } from '../customers.service';

@Injectable()
export class JwtCustomerStrategy extends PassportStrategy(
  Strategy,
  'jwt-customer',
) {
  constructor(private readonly customersService: CustomersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_CUSTOMER_SECRET!, // ⚠️ obrigatoriamente string
      passReqToCallback: false, // pode ser true se quiser receber req
    });
  }

  async validate(payload: any) {
    const customer = await this.customersService.getCustomerById(
      payload.userId,
    );
    if (!customer) throw new UnauthorizedException('Cliente não encontrado');

    return {
      userId: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
    };
  }
}
