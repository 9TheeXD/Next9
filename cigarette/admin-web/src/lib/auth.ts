import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import { NextRequest } from "next/server";

interface JWTPayload {
  userId: string;
  role: string;
}

/**
 * Multi-tiered secret resolution:
 * 1. Environment variable
 * 2. Local file
 * 3. Ephemeral random generation + severe warning
 *
 * NEVER uses a hardcoded literal fallback.
 */
function getJWTSecret(): string {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  const secretFilePath = "./jwt_secret.txt";
  if (fs.existsSync(secretFilePath)) {
    return fs.readFileSync(secretFilePath, "utf-8").trim();
  }

  console.warn(
    "[SECURITY WARNING] Generating ephemeral JWT secret. " +
      "This instance is isolated and tokens will NOT be valid across restarts or instances. " +
      "Set JWT_SECRET environment variable for production."
  );
  return crypto.randomBytes(32).toString("hex");
}

const JWT_SECRET = getJWTSecret();
const TOKEN_EXPIRY = "3650d";
const SALT_ROUNDS = 12;

export function createToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: TOKEN_EXPIRY,
    algorithm: "HS256",
  });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    // Explicitly specify allowed algorithms to reject 'none'
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as JWTPayload;
    return decoded;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Extracts and verifies the JWT from the Authorization header.
 * Returns the decoded payload or null if invalid/missing.
 */
export function authenticateRequest(
  request: NextRequest
): JWTPayload | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  return verifyToken(token);
}

/**
 * Validates password strength:
 * - Minimum 8 characters
 * - No maximum length restriction (up to 128 chars)
 * - Allows all character types
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  message: string;
} {
  if (!password || password.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters" };
  }
  if (password.length > 128) {
    return { valid: false, message: "Password must not exceed 128 characters" };
  }
  return { valid: true, message: "Password meets requirements" };
}
