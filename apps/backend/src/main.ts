import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import type { Request, Response, NextFunction } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security response headers. This service only ever returns JSON, so the
  // strictest possible CSP applies — nothing is meant to be loaded, framed or
  // embedded from an API response.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { "default-src": ["'none'"], "frame-ancestors": ["'none'"], "base-uri": ["'none'"] },
      },
      frameguard: { action: "deny" },
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: "no-referrer" },
    }),
  );

  // Welfare records, entitlements and tokens must never sit in a shared or
  // browser cache — every API response is per-citizen and authorization-bound.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const origins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.length ? origins : true, credentials: true });

  // Production boot-guard: a public deployment must never run on dev fallbacks.
  if (process.env.NODE_ENV === "production") {
    const HARDHAT_DEV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    const problems: string[] = [];
    const jwt = process.env.JWT_SECRET ?? "";
    if (!jwt || jwt === "change-me-dev-only" || jwt.length < 32)
      problems.push("JWT_SECRET must be a strong random value (>= 32 chars)");
    if ((process.env.RELAYER_PRIVATE_KEY ?? "").toLowerCase() === HARDHAT_DEV_KEY)
      problems.push("RELAYER_PRIVATE_KEY is the publicly-known Hardhat dev key — use a fresh funded key");
    if (!origins.length)
      problems.push("CORS_ORIGINS must list the allowed web origins (unset = reflect-any-origin)");
    if (problems.length) {
      // eslint-disable-next-line no-console
      console.error(`FATAL — refusing to start in production:\n - ${problems.join("\n - ")}`);
      process.exit(1);
    }
  }

  // Render (and most PaaS) inject PORT; BACKEND_PORT stays the local-dev knob.
  const port = Number(process.env.PORT ?? process.env.BACKEND_PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`BharatChain backend listening on http://localhost:${port}`);
}

void bootstrap();
