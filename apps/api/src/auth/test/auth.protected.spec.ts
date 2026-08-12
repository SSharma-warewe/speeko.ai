import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AdminsService } from '../../admins/admins.service';
import { OrganizationsService } from '../../organizations/organizations.service';
import { UsersService } from '../../users/users.service';
import { UserRole } from '../../users/user.entity';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { LoginRateLimitGuard } from '../guards/login-rate-limit.guard';
import { JwtStrategy } from '../jwt.strategy';
import { LoginRateLimitService } from '../login-rate-limit.service';

const JWT_SECRET = 'test-secret-for-protected-routes';
const WRONG_SECRET = 'wrong-secret-other-key';

describe('Auth protected routes (JwtAuthGuard + AdminGuard)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let adminsFindById: jest.Mock;
  let usersFindById: jest.Mock;

  const activeAdmin = {
    id: 'admin-id',
    email: 'admin@local.dev',
    name: 'Platform Admin',
    passwordHash: 'hash-admin',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  };

  const activeUser = {
    id: 'user-id',
    email: 'agent@acme.com',
    name: 'Agent A',
    passwordHash: 'hash-user',
    organizationId: 'org-a-id',
    role: UserRole.ORG_ADMIN,
    isActive: true,
    organization: {
      id: 'org-a-id',
      name: 'Org A',
      slug: 'org-a',
      isActive: true,
    },
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  };

  beforeAll(async () => {
    adminsFindById = jest.fn().mockResolvedValue(activeAdmin);
    usersFindById = jest.fn().mockResolvedValue(activeUser);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              JWT_SECRET,
              JWT_EXPIRES_IN: '1h',
              AUTH_LOGIN_MAX_ATTEMPTS: 1000,
              AUTH_LOGIN_WINDOW_MS: 60_000,
            }),
          ],
        }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        JwtStrategy,
        LoginRateLimitService,
        LoginRateLimitGuard,
        {
          provide: AdminsService,
          useValue: {
            findByEmail: jest.fn(),
            findById: adminsFindById,
          },
        },
        {
          provide: UsersService,
          useValue: {
            findByOrgAndEmail: jest.fn(),
            findById: usersFindById,
          },
        },
        {
          provide: OrganizationsService,
          useValue: {
            findById: jest.fn(),
            findBySlug: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    jwtService = moduleFixture.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    adminsFindById.mockReset();
    usersFindById.mockReset();
    adminsFindById.mockResolvedValue(activeAdmin);
    usersFindById.mockResolvedValue(activeUser);
  });

  function signAdmin(overrides: Record<string, unknown> = {}) {
    return jwtService.sign({
      sub: activeAdmin.id,
      typ: 'admin',
      email: activeAdmin.email,
      ...overrides,
    });
  }

  function signUser(overrides: Record<string, unknown> = {}) {
    return jwtService.sign({
      sub: activeUser.id,
      typ: 'user',
      email: activeUser.email,
      orgId: activeUser.organizationId,
      role: activeUser.role,
      ...overrides,
    });
  }

  describe('13. invalid / expired JWT cannot reach protected endpoints', () => {
    it('GET /auth/me without Authorization → 401', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('GET /auth/admin/me without Authorization → 401', async () => {
      await request(app.getHttpServer()).get('/auth/admin/me').expect(401);
    });

    it('GET /auth/me with garbage Bearer token → 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer not.a.valid.jwt')
        .expect(401);
    });

    it('GET /auth/me with token signed by wrong secret → 401', async () => {
      const wrongJwt = new JwtService({
        secret: WRONG_SECRET,
        signOptions: { expiresIn: '1h' },
      });
      const badToken = wrongJwt.sign({
        sub: activeUser.id,
        typ: 'user',
        email: activeUser.email,
        orgId: activeUser.organizationId,
        role: activeUser.role,
      });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${badToken}`)
        .expect(401);
    });

    it('GET /auth/me with expired token → 401', async () => {
      const expired = jwtService.sign(
        {
          sub: activeUser.id,
          typ: 'user',
          email: activeUser.email,
          orgId: activeUser.organizationId,
          role: activeUser.role,
        },
        { expiresIn: '-1s' },
      );

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });
  });

  describe('deactivated principals lose access with unexpired JWT', () => {
    it('inactive user → 401 on GET /auth/me', async () => {
      usersFindById.mockResolvedValue({ ...activeUser, isActive: false });
      const token = signUser();

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('inactive organization → 401 on GET /auth/me', async () => {
      usersFindById.mockResolvedValue({
        ...activeUser,
        organization: { ...activeUser.organization, isActive: false },
      });
      const token = signUser();

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('inactive admin → 401 on GET /auth/admin/me', async () => {
      adminsFindById.mockResolvedValue({ ...activeAdmin, isActive: false });
      const token = signAdmin();

      await request(app.getHttpServer())
        .get('/auth/admin/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });

  describe('10. AdminGuard rejects user tokens on admin routes', () => {
    it('GET /auth/admin/me with valid user JWT → 403', async () => {
      const token = signUser();

      await request(app.getHttpServer())
        .get('/auth/admin/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  describe('control paths', () => {
    it('GET /auth/admin/me with valid admin JWT → 200', async () => {
      const token = signAdmin();

      const res = await request(app.getHttpServer())
        .get('/auth/admin/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: activeAdmin.id,
        email: activeAdmin.email,
        typ: 'admin',
      });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('GET /auth/me with valid user JWT → 200', async () => {
      const token = signUser();

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: activeUser.id,
        email: activeUser.email,
        typ: 'user',
        role: UserRole.ORG_ADMIN,
      });
      expect(res.body).not.toHaveProperty('passwordHash');
    });
  });
});
