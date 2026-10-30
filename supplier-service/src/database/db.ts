/*
This file will 
- Initialize connections to the PostgresSQL database hosted on Supabase rn
- Export the database connection pool for use in other files
*/

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

import * as supplierSchema from '@data/schema';
import * as hoursSchema from '@data/opening-hours-schema';
import * as dataRelations from '@data/relations';

//environment variables for database connection

const maxConnections = process.env.MAX_CONNECTIONS || 11;
const connectionString = process.env.DATABASE_URL;
//11 is the maximum number of connections to the database (default postgres is 10)

//added in discrete credentials due to issue raised on shared .env in this folder
//production database credentials might win over test credentials and lead to accidental data destruction

const discreteCredentials = connectionString
   ? {}
   : {
      password: process.env.DATABASE_PASSWORD,
      user: process.env.DATABASE_USER,
      host: process.env.DATABASE_HOST,
   };


const pool = new Pool({
   connectionString: connectionString,
   ...discreteCredentials,
   max: Number(maxConnections),
   idleTimeoutMillis: 30000,
   connectionTimeoutMillis: 2000,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on PostgresSQL client', err);
});

export const db = drizzle({ 
                     client: pool, 
                     schema: { ...supplierSchema, ...hoursSchema, ...dataRelations },
                  });
export default pool;
