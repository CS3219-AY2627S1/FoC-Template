\set ECHO none
\set ON_ERROR_STOP on

\getenv database FOC_DATABASE_NAME
\getenv username FOC_DATABASE_USERNAME
\getenv password FOC_DATABASE_PASSWORD
\getenv admin PGUSER

-- Create the role without changing existing credentials.
SELECT format(
    'CREATE ROLE %I LOGIN PASSWORD %L',
    :'username', :'password'
)
WHERE NOT EXISTS (
    SELECT FROM pg_roles WHERE rolname = :'username'
)
\gexec

-- Creating a database for another owner requires SET ROLE permission.
GRANT :"username" TO :"admin" WITH INHERIT FALSE, SET TRUE;

-- Create the database if missing; psql runs this outside a transaction.
SELECT format(
    'CREATE DATABASE %I OWNER %I',
    :'database', :'username'
)
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = :'database'
)
\gexec

SET ROLE :"username";
REVOKE ALL ON DATABASE :"database" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"database" TO :"username";
RESET ROLE;

\echo Set up database :database
