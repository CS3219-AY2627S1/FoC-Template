-- Add the soft-deletion lifecycle state used by the Errand Service.
ALTER TYPE "ErrandStatus" ADD VALUE IF NOT EXISTS 'DELETED';
