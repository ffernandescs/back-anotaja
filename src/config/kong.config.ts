import { registerAs } from '@nestjs/config';

export default registerAs('kong', () => ({
  adminUrl: process.env.KONG_ADMIN_URL || 'http://localhost:8001',
  gatewayUrl: process.env.KONG_GATEWAY_URL || 'http://localhost:8000',
}));

