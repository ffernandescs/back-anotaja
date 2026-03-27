import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtOwnerAuthGuard extends AuthGuard('jwt-owner') {}
