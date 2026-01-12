export interface JwtPayload {
  sub?: string;
  userId?: string;
  email?: string;
  role?: string;
  branchId?: string;
  [key: string]: any; // caso existam outros campos
}
