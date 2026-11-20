import type { AuthenticatedUser } from './authenticated-user';

declare module '@nestjs/authentication' {
  interface AuthenticationTypes {
    user: AuthenticatedUser;
    refreshTokens: false;
  }
}
