import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Public } from '@nestjs/authentication';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiErrorResponseDto } from '../common/api-error-response.dto';
import { AuthUserResponseDto } from './dto/auth-user-response.dto';
import { AuthTokenResponseDto } from './dto/auth-token-response.dto';
import { CreateMemberDto } from './dto/create-member.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './authenticated-user';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Sign in and receive a short-lived access token' })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid email or password.',
    type: ApiErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'Login rate limit exceeded.',
    type: ApiErrorResponseDto,
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated workspace member' })
  @ApiOkResponse({ type: AuthUserResponseDto })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Post('members')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Add an agent account to the current workspace' })
  @ApiCreatedResponse({ type: AuthUserResponseDto })
  @ApiConflictResponse({
    description: 'A user with this email already exists.',
    type: ApiErrorResponseDto,
  })
  @ApiForbiddenResponse({
    description: 'Only workspace admins can add members.',
    type: ApiErrorResponseDto,
  })
  createMember(
    @Body() dto: CreateMemberDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authService.createMember(dto, user.workspaceId);
  }
}
