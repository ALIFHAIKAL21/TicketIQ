import { PasswordHasher } from '@nestjs/authentication';
import { PrismaClient, UserRole } from '@prisma/client';

const DEFAULT_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error(
    'Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD before seeding.',
  );
}
if (password.length < 12 || password.length > 128) {
  throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be 12-128 characters long.');
}

const prisma = new PrismaClient();
const passwordHasher = new PasswordHasher();

try {
  await prisma.workspace.upsert({
    where: { id: DEFAULT_WORKSPACE_ID },
    create: {
      id: DEFAULT_WORKSPACE_ID,
      name: 'TicketIQ Demo Workspace',
    },
    update: {},
  });

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        displayName: 'Workspace Admin',
        passwordHash: await passwordHasher.hash(password),
        role: UserRole.ADMIN,
        workspaceId: DEFAULT_WORKSPACE_ID,
      },
    });
  } else if (
    user.role !== UserRole.ADMIN ||
    user.workspaceId !== DEFAULT_WORKSPACE_ID
  ) {
    throw new Error(
      'The configured bootstrap account already exists outside the default admin workspace.',
    );
  }

  const existingAgent = await prisma.agent.findUnique({ where: { email } });
  if (!existingAgent) {
    await prisma.agent.create({
      data: {
        displayName: user.displayName,
        email,
        userId: user.id,
        workspaceId: DEFAULT_WORKSPACE_ID,
      },
    });
  } else if (
    existingAgent.workspaceId !== DEFAULT_WORKSPACE_ID ||
    (existingAgent.userId && existingAgent.userId !== user.id)
  ) {
    throw new Error(
      'The configured bootstrap email is already used by an agent outside the default workspace.',
    );
  } else if (!existingAgent.userId) {
    await prisma.agent.update({
      where: { id: existingAgent.id },
      data: { userId: user.id },
    });
  }

  console.log(`Bootstrap admin is ready: ${email}`);
} finally {
  await prisma.$disconnect();
}
