import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import type { RegisterInput } from '../api/dto/registerDto';
import type { LoginInput } from '../api/dto/loginDto';
import type { UpdateProfileInput } from '../api/dto/updateProfileDto';
import { enqueueUserCreated } from '../events/outboxStore';

const SALT_ROUNDS = 10;

// Profile: everything except secrets — for the user themselves or an admin.
export const profileSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  email: true,
  roles: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

// Public profile: what anyone may see — for other services.
const publicProfileSelect = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

// Shared by register and the admin bootstrap so every
// account is built the same way.
export async function buildNewUser(input: RegisterInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    username: input.username,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, SALT_ROUNDS),
  };
}

// Which field a unique-constraint violation (Prisma P2002) hit, or null if
// it's not a duplicate email/username.
export function duplicateField(err: unknown): 'email' | 'username' | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return null;
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target.join(',') : String(target ?? '');
  if (fields.includes('email')) return 'email';
  if (fields.includes('username')) return 'username';
  return null;
}

export async function register(input: RegisterInput) {
  // Check duplicate email or username
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
    select: { email: true, username: true },
  });
  if (existing) {
    const field = existing.email === input.email ? 'email' : 'username';
    return { ok: false as const, field };
  }

  try {
    //DECLARATION CHANGED
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: await buildNewUser(input),
        select: profileSelect,
      });
      await enqueueUserCreated(tx, created.id);
      return created;
    });
    return { ok: true as const, user };
  } catch (err) {
    // Safety net for the check-then-insert race: the DB's @unique constraint
    // rejects a duplicate that slipped past the pre-check (Prisma code P2002).
    const field = duplicateField(err);
    if (field) return { ok: false as const, field };
    throw err;
  }
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, passwordHash: true, roles: true },
  });

  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    return { ok: false as const };
  }

  return { ok: true as const, userId: user.id, roles: user.roles };
}

export async function getProfile(id: string) {
  return prisma.user.findUnique({ 
    where: { id }, 
    select: profileSelect });
}

export async function getPublicProfile(id: string) {
  return prisma.user.findUnique({
    where: { id, isDeleted: false },
    select: publicProfileSelect,
  });
}

export async function updateProfile(id: string, input: UpdateProfileInput) {
  if (input.username) {
    const taken = await prisma.user.findFirst({
      where: { username: input.username, NOT: { id } },
      select: { id: true },
    });
    if (taken) return { ok: false as const, reason: 'username_taken' as const };
  }

  try {
    const user = await prisma.user.update({ where: { id }, data: input, select: profileSelect });
    return { ok: true as const, user };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') return { ok: false as const, reason: 'username_taken' as const };
      if (err.code === 'P2025') return { ok: false as const, reason: 'not_found' as const };
    }
    throw err;
  }
}

export async function listProfiles() {
  return prisma.user.findMany({ select: profileSelect });
}
