import jwt from "jsonwebtoken";
import { IntentTokenPayload, Mandate } from "../types/types";

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set in environment");
  return secret;
}

// Issue a short-lived signed token with approved steps only
export function issueIntentToken(
  approvedSteps: string[],
  mandate: Mandate
): string {
  const payload: IntentTokenPayload = {
    approvedSteps,
    mandate,
  };

  return jwt.sign(payload, getSecret(), {
    expiresIn: "10m", // ephemeral — short-lived by design
    issuer: "tradeguard",
  });
}

// Verify and decode the token
export function decodeIntentToken(token: string): IntentTokenPayload {
  const decoded = jwt.verify(token, getSecret(), {
    issuer: "tradeguard",
  }) as IntentTokenPayload;
  return decoded;
}
