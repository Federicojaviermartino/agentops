import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Logger, Module, NotFoundException, Param, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, MinLength, Matches } from 'class-validator';
import { JwtService, JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { PrismaService, PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../common/index';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

// JWT Strategy
@Injectable()
class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: (process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET required in production'); })() : 'dev-secret-only-for-local') as string) });
  }
  async validate(payload: any) {
    const user = await this.prisma.user.findFirst({ where: { id: payload.sub }, select: { id: true, email: true, name: true, role: true, organizationId: true, locale: true } });
    if (!user) throw new UnauthorizedException();
    return user;
  }
}

// Email Service

// Auth Service

// Controller

// DTOs
class RegisterDto { @IsEmail() email: string; @IsString() @MinLength(8) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, { message: 'Password must contain uppercase, lowercase, and number' }) password: string; @IsString() name: string; @IsString() organizationName: string; }

class LoginDto { @IsEmail() email: string; @IsString() password: string; }

class ForgotPasswordDto { @IsEmail() email: string; }

class ResetPasswordDto { @IsString() token: string; @IsString() @MinLength(8) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, { message: 'Password must contain uppercase, lowercase, and number' }) newPassword: string; }

class ChangePasswordDto { @IsString() currentPassword: string; @IsString() @MinLength(8) @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, { message: 'Password must contain uppercase, lowercase, and number' }) newPassword: string; }

class InviteUserDto { @IsEmail() email: string; @IsString() name: string; @IsString() role: string; }

class UpdateProfileDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsString() locale?: string; }

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  async send(to: string, subject: string, html: string) {
    const key = process.env.RESEND_API_KEY;
    if (!key) { this.logger.warn(`Email skipped (no key): ${subject} -> ${to}`); return; }
    try {
      await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM || 'AgentOps <noreply@agentops.eu>', to, subject, html }) });
    } catch (e) { this.logger.error(`Email failed: ${(e as Error).message}`); }
  }
  wrap(title: string, body: string) {
    return `<div style="font-family:Arial;max-width:600px;margin:0 auto"><div style="background:#1e40af;padding:20px;color:white"><h2 style="margin:0">${title}</h2></div><div style="padding:20px;border:1px solid #e5e7eb">${body}</div></div>`;
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(private prisma: PrismaService, private jwt: JwtService, private email: EmailService) {}

  async register(dto: RegisterDto) {
    if (await this.prisma.user.findFirst({ where: { email: dto.email } })) throw new ConflictException('Email already registered');
    const org = await this.prisma.organization.create({ data: { name: dto.organizationName } });
    const user = await this.prisma.user.create({ data: { email: dto.email, name: dto.name, passwordHash: await bcrypt.hash(dto.password, 12), role: 'OWNER', organizationId: org.id } });
    const tokens = await this.genTokens(user.id, user.email, user.role, org.id);
    await this.prisma.user.update({ where: { id: user.id }, data: { refreshToken: tokens.refreshToken } });
    await this.prisma.auditLog.create({ data: { action: 'USER_REGISTERED', resource: 'auth', userId: user.id, userName: user.name, organizationId: org.id } });
    this.email.send(user.email, 'Welcome to AgentOps', this.email.wrap('Welcome', `<p>Hi ${user.name}, your account is ready.</p><a href="${process.env.FRONTEND_URL}" style="display:inline-block;padding:10px 24px;background:#1e40af;color:white;text-decoration:none;border-radius:6px">Go to Dashboard</a>`)).catch(() => {});
    this.logger.log(`Registered: ${user.email}`);
    return { ...tokens, user: { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: org.id, organization: { id: org.id, name: org.name, plan: org.plan } } };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({ where: { email: dto.email }, include: { organization: { select: { id: true, name: true, plan: true } } } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException('Invalid credentials');
    const tokens = await this.genTokens(user.id, user.email, user.role, user.organizationId);
    await this.prisma.user.update({ where: { id: user.id }, data: { refreshToken: tokens.refreshToken, lastLoginAt: new Date() } });
    return { ...tokens, user: { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId, locale: user.locale, organization: user.organization } };
  }

  async refresh(rt: string) {
    try {
      const p = await this.jwt.verifyAsync(rt, { secret: (process.env.JWT_REFRESH_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_REFRESH_SECRET required in production'); })() : 'dev-refresh-only-for-local') as string) });
      const user = await this.prisma.user.findFirst({ where: { id: p.sub, refreshToken: rt } });
      if (!user) throw new UnauthorizedException();
      return this.genTokens(user.id, user.email, user.role, user.organizationId);
    } catch { throw new UnauthorizedException('Invalid refresh token'); }
  }

  async logout(uid: string) { await this.prisma.user.update({ where: { id: uid }, data: { refreshToken: null } }); return { message: 'Logged out' }; }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      // B02 FIX: Use PasswordResetToken table instead of refreshToken field
      await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }); // Invalidate old tokens
      await this.prisma.passwordResetToken.create({ data: { tokenHash, expiresAt: new Date(Date.now() + 3600000), userId: user.id } });
      this.email.send(user.email, 'Reset your password', this.email.wrap('Password Reset', `<p>Click below to reset (expires in 1 hour):</p><a href="${process.env.FRONTEND_URL}/reset-password?token=${token}" style="display:inline-block;padding:10px 24px;background:#1e40af;color:white;text-decoration:none;border-radius:6px">Reset Password</a>`)).catch(() => {});
    }
    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    // B02 FIX: Query PasswordResetToken table
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!resetToken || resetToken.usedAt) throw new BadRequestException('Invalid or expired token');
    if (new Date() > resetToken.expiresAt) throw new BadRequestException('Token expired');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) } }),
      this.prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    ]);
    return { message: 'Password reset successfully' };
  }

  async changePassword(uid: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: uid } });
    if (!user || !(await bcrypt.compare(dto.currentPassword, user.passwordHash))) throw new BadRequestException('Current password is incorrect');
    await this.prisma.user.update({ where: { id: uid }, data: { passwordHash: await bcrypt.hash(dto.newPassword, 12) } });
    return { message: 'Password changed' };
  }

  async inviteUser(orgId: string, inviterId: string, dto: InviteUserDto) {
    if (await this.prisma.user.findFirst({ where: { email: dto.email, organizationId: orgId } })) throw new ConflictException('User already in organization');
    const [org, inviter] = await Promise.all([this.prisma.organization.findUnique({ where: { id: orgId } }), this.prisma.user.findUnique({ where: { id: inviterId } })]);
    const tempPw = crypto.randomBytes(8).toString('hex');
    const user = await this.prisma.user.create({ data: { email: dto.email, name: dto.name, passwordHash: await bcrypt.hash(tempPw, 12), role: dto.role as any, organizationId: orgId } });
    this.email.send(dto.email, `Invitation to ${org!.name}`, this.email.wrap('Team Invitation', `<p>${inviter!.name} invited you to <strong>${org!.name}</strong>.</p><p>Email: ${dto.email}<br>Temp password: ${tempPw}</p><a href="${process.env.FRONTEND_URL}" style="display:inline-block;padding:10px 24px;background:#1e40af;color:white;text-decoration:none;border-radius:6px">Sign In</a>`)).catch(() => {});
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  async updateProfile(uid: string, dto: UpdateProfileDto) { return this.prisma.user.update({ where: { id: uid }, data: { ...(dto.name && { name: dto.name }), ...(dto.locale && { locale: dto.locale }) }, select: { id: true, email: true, name: true, role: true, locale: true } }); }
  async listTeam(orgId: string) { return this.prisma.user.findMany({ where: { organizationId: orgId }, select: { id: true, email: true, name: true, role: true, locale: true, lastLoginAt: true, createdAt: true }, orderBy: { createdAt: 'asc' } }); }
  async removeMember(orgId: string, uid: string, requesterId: string) { if (uid === requesterId) throw new BadRequestException('Cannot remove yourself'); const u = await this.prisma.user.findFirst({ where: { id: uid, organizationId: orgId } }); if (!u) throw new NotFoundException(); if (u.role === 'OWNER') throw new BadRequestException('Cannot remove owner'); await this.prisma.user.delete({ where: { id: uid } }); return { message: 'Removed' }; }
  async updateRole(orgId: string, uid: string, role: string) { await this.prisma.user.findFirst({ where: { id: uid, organizationId: orgId } }).then(u => { if (!u) throw new NotFoundException(); }); return this.prisma.user.update({ where: { id: uid }, data: { role: role as any }, select: { id: true, email: true, name: true, role: true } }); }

  private async genTokens(uid: string, email: string, role: string, orgId: string) {
    const p = { sub: uid, email, role, organizationId: orgId };
    const [accessToken, refreshToken] = await Promise.all([this.jwt.signAsync(p, { secret: (process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_SECRET required in production'); })() : 'dev-secret-only-for-local') as string), expiresIn: '15m' }), this.jwt.signAsync(p, { secret: (process.env.JWT_REFRESH_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('JWT_REFRESH_SECRET required in production'); })() : 'dev-refresh-only-for-local') as string), expiresIn: '7d' })]);
    return { accessToken, refreshToken };
  }
}

@ApiTags('Auth') @Controller('auth')
export class AuthController {
  constructor(private a: AuthService) {}
  @Post('register') @ApiOperation({ summary: 'Register new organization and admin account' }) register(@Body() d: RegisterDto) { return this.a.register(d); }
  @Post('login') @ApiOperation({ summary: 'Login with email/password, returns JWT tokens' }) login(@Body() d: LoginDto) { return this.a.login(d); }
  @Post('refresh') @ApiOperation({ summary: 'Refresh JWT access token' }) refresh(@Body('refreshToken') t: string) { return this.a.refresh(t); }
  @Post('logout') @ApiOperation({ summary: 'Logout and invalidate refresh token' }) @ApiBearerAuth() @UseGuards(JwtAuthGuard) logout(@CurrentUser('id') u: string) { return this.a.logout(u); }
  @Get('me') @ApiOperation({ summary: 'Get current user profile' }) @ApiBearerAuth() @UseGuards(JwtAuthGuard) me(@CurrentUser() u: any) { return u; }
  @Post('forgot-password') @ApiOperation({ summary: 'Request password reset email' }) forgot(@Body() d: ForgotPasswordDto) { return this.a.forgotPassword(d); }
  @Post('reset-password') @ApiOperation({ summary: 'Reset password with token' }) reset(@Body() d: ResetPasswordDto) { return this.a.resetPassword(d); }
  @Post('change-password') @ApiOperation({ summary: 'Change password (authenticated)' }) @ApiBearerAuth() @UseGuards(JwtAuthGuard) changePw(@CurrentUser('id') u: string, @Body() d: ChangePasswordDto) { return this.a.changePassword(u, d); }
  @Post('profile') @ApiOperation({ summary: 'Update user profile' }) @ApiBearerAuth() @UseGuards(JwtAuthGuard) profile(@CurrentUser('id') u: string, @Body() d: UpdateProfileDto) { return this.a.updateProfile(u, d); }
  @Get('team') @ApiOperation({ summary: 'List team members' }) @ApiBearerAuth() @UseGuards(JwtAuthGuard) team(@CurrentUser('organizationId') o: string) { return this.a.listTeam(o); }
  @Post('team/invite') @ApiOperation({ summary: 'Invite new team member by email' }) @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles('OWNER','ADMIN') invite(@CurrentUser('organizationId') o: string, @CurrentUser('id') u: string, @Body() d: InviteUserDto) { return this.a.inviteUser(o, u, d); }
  @Post('team/:userId/remove') @ApiOperation({ summary: 'Delete by ID auth' }) @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles('OWNER','ADMIN') remove(@CurrentUser('organizationId') o: string, @CurrentUser('id') u: string, @Param('userId') uid: string) { return this.a.removeMember(o, uid, u); }
  @Post('team/:userId/role') @ApiOperation({ summary: 'Role' }) @ApiBearerAuth() @UseGuards(JwtAuthGuard, RolesGuard) @Roles('OWNER') role(@CurrentUser('organizationId') o: string, @Param('userId') uid: string, @Body('role') r: string) { return this.a.updateRole(o, uid, r); }
}

@Module({
  imports: [PrismaModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, EmailService],
  exports: [AuthService, EmailService],
})
export class AuthModule {}



