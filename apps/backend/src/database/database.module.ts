import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ENTITIES } from "../entities";

/**
 * Postgres connection (TypeORM). All entities are registered here via
 * `forFeature` so `synchronize` builds every table on boot; the repos are
 * re-exported globally so feature modules can inject them directly.
 * `synchronize` is on for the dev/demo build — no migrations for the prototype.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature(ENTITIES),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Prefer a single DATABASE_URL (hosted Postgres, e.g. Neon) over the
        // discrete local vars; ?sslmode=require in the URL turns TLS on.
        const url = config.get<string>("DATABASE_URL");
        const connection = url
          ? { url, ssl: url.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined }
          : {
              host: config.get<string>("POSTGRES_HOST", "localhost"),
              port: Number(config.get<string>("POSTGRES_PORT", "5432")),
              username: config.get<string>("POSTGRES_USER", "bharat"),
              password: config.get<string>("POSTGRES_PASSWORD", "bharat"),
              database: config.get<string>("POSTGRES_DB", "bharatchain"),
            };
        // No migrations in the prototype: hosted deploys set DB_SYNCHRONIZE=true
        // so the schema still builds on boot under NODE_ENV=production.
        const syncOverride = config.get<string>("DB_SYNCHRONIZE");
        return {
          type: "postgres" as const,
          ...connection,
          autoLoadEntities: true,
          synchronize: syncOverride
            ? syncOverride === "true"
            : config.get<string>("NODE_ENV") !== "production",
        };
      },
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
