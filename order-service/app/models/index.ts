// AI Assistance Disclosure:
// Tool: GitHub Copilot, date: 2026-11-07
// Scope: Configure Sequelize to use SSL when PostgreSQL SSL is enabled.
// Author review: Reviewed manually and tested on deployment. The change was only 3 lines.

import { Sequelize } from "sequelize";
import dbConfig from "../config/db.config.ts";
import defineOrder from "./orderModel.ts";
import defineOutboxEvent from "./outboxEventModel.ts";

export const sequelize = new Sequelize(dbConfig.DB, dbConfig.USER, dbConfig.PASSWORD, {
  host: dbConfig.HOST,
  port: dbConfig.PORT,
  dialect: dbConfig.dialect,
  pool: dbConfig.pool,
  dialectOptions: dbConfig.SSL
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
  logging: process.env.DB_LOGGING === "true" ? console.log : false,
});

export const Order = defineOrder(sequelize);
export const OutboxEvent = defineOutboxEvent(sequelize);