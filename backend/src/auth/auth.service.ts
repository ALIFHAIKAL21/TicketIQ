import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PasswordHasher, TokenService } from '@nestjs/authentication';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './authenticated-user';
import { CreateMemberDto } from './dto/create-member.dto';
import { LoginDto } from './dto/login.dto';
import './auth.types';

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  role: true,
  workspaceId: true,
  isActive: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    const validPassword = await this.passwordHasher.verify(
      dto.password,
      user?.passwordHash,
    );

    if (!user || !user.isActive || !validPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (this.passwordHasher.needsRehash(user.passwordHash)) {
      const passwordHash = await this.passwordHasher.hash(dto.password);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
    }

    const tokens = await this.tokenService.issue(user.id, {
      method: 'password',
    });
    return { ...tokens, tokenType: 'Bearer' as const };
  }

  findActiveById(id: string): Promise<AuthenticatedUser | null> {
    return this.prisma.user.findFirst({
      where: { id, isActive: true },
      select: USER_SELECT,
    });
  }

  async createMember(dto: CreateMemberDto, workspaceId: string) {
    const passwordHash = await this.passwordHasher.hash(dto.password);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            email: dto.email,
            displayName: dto.displayName,
            passwordHash,
            role: UserRole.AGENT,
            workspaceId,
          },
          select: USER_SELECT,
        });

        await transaction.agent.create({
          data: {
            displayName: user.displayName,
            email: user.email,
            userId: user.id,
            workspaceId,
          },
        });

        return user;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A user with this email already exists');
      }
      throw error;
    }
  }
}
