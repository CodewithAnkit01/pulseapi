import {
  registerUser,
  loginUser,
  rotateRefreshToken,
  logoutUser,
  logoutAllDevices,
  getCurrentUser,
  refreshCookieName,
} from "./auth.service.js";

import {
  registerSchema,
  loginSchema,
} from "./auth.validator.js";

import { env } from "../../config/env.js";

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/api/v1/auth",
};

const setRefreshCookie = (res, token) => {
  res.cookie(refreshCookieName, token, {
    ...cookieOptions,
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie(refreshCookieName, cookieOptions);
};

export const register = async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);

    await registerUser(data);

    // Automatically log in after successful registration.
    const result = await loginUser({
      email: data.email,
      password: data.password,
    });

    setRefreshCookie(res, result.refreshToken);

    return res.status(201).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  } catch (error) {
    if (error.code === "P2002") {
      error.statusCode = 409;
      error.code = "EMAIL_ALREADY_EXISTS";
      error.message = "An account with this email already exists";
    }

    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await loginUser(data);

    setRefreshCookie(res, result.refreshToken);

    return res.status(200).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.[refreshCookieName];
    const result = await rotateRefreshToken(token);

    setRefreshCookie(res, result.refreshToken);

    return res.status(200).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  } catch (error) {
    clearRefreshCookie(res);
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    await logoutUser(req.cookies?.[refreshCookieName]);

    clearRefreshCookie(res);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const logoutAll = async (req, res, next) => {
  try {
    await logoutAllDevices(req.user.userId);

    clearRefreshCookie(res);

    return res.status(200).json({
      success: true,
      message: "All refresh sessions have been revoked",
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (req, res, next) => {
  try {
    const user = await getCurrentUser(req.user.userId);

    return res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};