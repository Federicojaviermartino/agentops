import { AuthService, EmailService } from './auth.module';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwt: any;
  let email: any;

  beforeEach(async () => {
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('Password123!', 12);

    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'u1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'u1', ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
      organization: {
        create: jest.fn().mockResolvedValue({ id: 'o1', name: 'Test Org', plan: 'FREE' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'o1', name: 'Test Org' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      passwordResetToken: {
        deleteMany: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({ id: 'prt1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation(arr => Promise.all(arr)),
      _hash: hash,
    };

    jwt = { signAsync: jest.fn().mockResolvedValue('mock-token'), verifyAsync: jest.fn() };
    email = { send: jest.fn().mockResolvedValue(undefined), wrap: jest.fn().mockReturnValue('<html></html>') };
    service = new AuthService(prisma, jwt, email);
  });

  describe('register', () => {
    it('creates org + user + returns tokens', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const r = await service.register({ email: 'new@test.com', password: 'Pass1234!', name: 'New', organizationName: 'Org' });
      expect(r.accessToken).toBe('mock-token');
      expect(r.user.role).toBe('OWNER');
      expect(r.user.email).toBe('new@test.com');
      expect(prisma.organization.create).toHaveBeenCalled();
      expect(prisma.auditLog.create).toHaveBeenCalled();
    });

    it('rejects duplicate email', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.register({ email: 'dup@t.com', password: 'P1234567!', name: 'D', organizationName: 'O' })).rejects.toThrow('already registered');
    });

    it('sends welcome email', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await service.register({ email: 'e@t.com', password: 'Pass1234!', name: 'N', organizationName: 'O' });
      // Email is fire-and-forget, so we just verify the service was called
      expect(email.send).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('returns tokens on valid credentials', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.com', passwordHash: prisma._hash, role: 'OWNER', organizationId: 'o1', locale: 'en', organization: { id: 'o1', name: 'Org', plan: 'FREE' } });
      const r = await service.login({ email: 'a@b.com', password: 'Password123!' });
      expect(r.accessToken).toBeDefined();
      expect(r.user.email).toBe('a@b.com');
    });

    it('updates lastLoginAt', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.com', passwordHash: prisma._hash, role: 'OWNER', organizationId: 'o1', organization: {} });
      await service.login({ email: 'a@b.com', password: 'Password123!' });
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastLoginAt: expect.any(Date) }) }));
    });

    it('rejects wrong password', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.com', passwordHash: prisma._hash, role: 'OWNER', organizationId: 'o1' });
      await expect(service.login({ email: 'a@b.com', password: 'WrongPass' })).rejects.toThrow('Invalid credentials');
    });

    it('rejects non-existent user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.login({ email: 'no@user.com', password: 'Pass' })).rejects.toThrow('Invalid credentials');
    });
  });

  describe('refresh', () => {
    it('issues new tokens on valid refresh', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u1' });
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.com', role: 'OWNER', organizationId: 'o1', refreshToken: 'valid' });
      const r = await service.refresh('valid');
      expect(r.accessToken).toBeDefined();
    });

    it('rejects invalid refresh token', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('invalid'));
      await expect(service.refresh('bad')).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('logout', () => {
    it('clears refresh token', async () => {
      await service.logout('u1');
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { refreshToken: null } });
    });
  });

  describe('forgotPassword', () => {
    it('returns generic message regardless of email existence', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const r = await service.forgotPassword({ email: 'nonexistent@test.com' });
      expect(r.message).toContain('If the email exists');
    });

    it('sends reset email when user exists', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u1', email: 'a@b.com' });
      await service.forgotPassword({ email: 'a@b.com' });
      expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalled();
      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(email.send).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('rejects invalid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword({ token: 'invalid', newPassword: 'NewPass123!' })).rejects.toThrow('Invalid or expired');
    });
  });

  describe('changePassword', () => {
    it('changes password on valid current', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: prisma._hash });
      const r = await service.changePassword('u1', { currentPassword: 'Password123!', newPassword: 'NewPass456!' });
      expect(r.message).toContain('changed');
    });

    it('rejects wrong current password', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: prisma._hash });
      await expect(service.changePassword('u1', { currentPassword: 'Wrong', newPassword: 'New123!' })).rejects.toThrow('incorrect');
    });
  });

  describe('inviteUser', () => {
    it('creates user and sends invite email', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', name: 'Inviter' });
      const r = await service.inviteUser('o1', 'u1', { email: 'new@team.com', name: 'New Member', role: 'DEVELOPER' });
      expect(r.email).toBe('new@team.com');
      expect(r.role).toBe('DEVELOPER');
      expect(email.send).toHaveBeenCalled();
    });

    it('rejects duplicate team member', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(service.inviteUser('o1', 'u1', { email: 'dup@team.com', name: 'Dup', role: 'VIEWER' })).rejects.toThrow('already');
    });
  });

  describe('removeMember', () => {
    it('prevents self-removal', async () => {
      await expect(service.removeMember('o1', 'u1', 'u1')).rejects.toThrow('Cannot remove yourself');
    });

    it('prevents owner removal', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u2', role: 'OWNER' });
      await expect(service.removeMember('o1', 'u2', 'u1')).rejects.toThrow('Cannot remove owner');
    });

    it('removes non-owner member', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'u2', role: 'DEVELOPER' });
      const r = await service.removeMember('o1', 'u2', 'u1');
      expect(r.message).toContain('Removed');
      expect(prisma.user.delete).toHaveBeenCalled();
    });
  });

  describe('listTeam', () => {
    it('returns team members', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1', email: 'a@b.com', name: 'A', role: 'OWNER' }]);
      const r = await service.listTeam('o1');
      expect(r).toHaveLength(1);
      expect(r[0].role).toBe('OWNER');
    });
  });
});
