import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminsModule } from '../admins/admins.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimitGuard } from './guards/login-rate-limit.guard';
import { PasswordPublicRateLimitGuard } from './guards/password-public-rate-limit.guard';
import { JwtStrategy } from './jwt.strategy';
import { LoginRateLimitService } from './login-rate-limit.service';
import { PasswordResetToken } from './password-reset-token.entity';
import { PasswordResetTokensRepository } from './password-reset-tokens.repository';
import { PasswordTokensService } from './password-tokens.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PasswordResetToken]),
    AdminsModule,
    OrganizationsModule,
    forwardRef(() => UsersModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h') as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LoginRateLimitService,
    LoginRateLimitGuard,
    PasswordPublicRateLimitGuard,
    PasswordResetTokensRepository,
    PasswordTokensService,
  ],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
