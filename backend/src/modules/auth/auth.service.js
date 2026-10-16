import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  randomBytes,
  randomUUID,
  createHash,
} from "node:crypto";

import prisma from "../../config/database.js";
import { env } from "../../config/env.js";

const ACCESS_TOKEN_COOKIE = "pulseapi_refresh";

const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");

const createAccessToken = (user) =>
  jwt.sign(
    {},
    env.ACCESS_TOKEN_SECRET,
    {
      subject: user.id,
      expiresIn: env.ACCESS_TOKEN_TTL,
    }
  );

const createRefreshToken = () =>
  randomBytes(48).toString("base64url");

const getRefreshExpiry = () =>
  new Date(
    Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000
  );

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
};

export const registerUser = async (data) => {
  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
    },
    select: publicUserSelect,
  });

  return user;
};

export const loginUser = async ({ email, password }) => {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw Object.assign(new Error("Invalid email or password"), {
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
  }

  const validPassword = await bcrypt.compare(
    password,
    user.passwordHash
  );

  if (!validPassword) {
    throw Object.assign(new Error("Invalid email or password"), {
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
    });
  }

  const refreshToken = createRefreshToken();
  const tokenHash = hashToken(refreshToken);

  await prisma.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash,
      familyId: randomUUID(),
      expiresAt: getRefreshExpiry(),
    },
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    accessToken: createAccessToken(user),
    refreshToken,
  };
};

export const rotateRefreshToken = async (rawToken) => {
  if (!rawToken) {
    throw Object.assign(new Error("Refresh token required"), {
      statusCode: 401,
      code: "REFRESH_TOKEN_REQUIRED",
    });
  }

  const oldHash = hashToken(rawToken);

  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash: oldHash },
    include: {
      user: {
        select: publicUserSelect,
      },
    },
  });

  if (!session) {
    throw Object.assign(new Error("Invalid refresh token"), {
      statusCode: 401,
      code: "INVALID_REFRESH_TOKEN",
    });
  }

  if (session.revokedAt) {
    // A rotated token was reused. Revoke every session in its family.
    await prisma.refreshSession.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    throw Object.assign(new Error("Refresh token reuse detected"), {
      statusCode: 401,
      code: "REFRESH_TOKEN_REUSE",
    });
  }

  if (session.expiresAt <= new Date()) {
    await prisma.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    throw Object.assign(new Error("Refresh token expired"), {
      statusCode: 401,
      code: "REFRESH_TOKEN_EXPIRED",
    });
  }

  const newRefreshToken = createRefreshToken();
  const newHash = hashToken(newRefreshToken);
  const now = new Date();

  // Claim the old token atomically. Concurrent refreshes cannot both win.
  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshSession.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        revokedAt: now,
        replacedByTokenHash: newHash,
      },
    });

    if (claimed.count !== 1) {
      return false;
    }

    await tx.refreshSession.create({
      data: {
        userId: session.userId,
        tokenHash: newHash,
        familyId: session.familyId,
        expiresAt: getRefreshExpiry(),
      },
    });

    return true;
  });

  if (!result) {
    // A concurrent refresh may have consumed this token.
    await prisma.refreshSession.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    throw Object.assign(new Error("Refresh token already used"), {
      statusCode: 401,
      code: "REFRESH_TOKEN_REUSE",
    });
  }

  return {
    user: session.user,
    accessToken: createAccessToken(session.user),
    refreshToken: newRefreshToken,
  };
};

export const logoutUser = async (rawToken) => {
  if (!rawToken) return;

  await prisma.refreshSession.updateMany({
    where: {
      tokenHash: hashToken(rawToken),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
};

export const logoutAllDevices = async (userId) => {
  await prisma.refreshSession.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
};

export const getCurrentUser = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  if (!user) {
    throw Object.assign(new Error("User not found"), {
      statusCode: 404,
      code: "USER_NOT_FOUND",
    });
  }

  return user;
};

export const refreshCookieName = ACCESS_TOKEN_COOKIE;