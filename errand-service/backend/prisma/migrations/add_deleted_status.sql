-- Migration: Add DELETED status to ErrandStatus enum
-- Run this in your PostgreSQL database to add the DELETED status

ALTER TYPE "ErrandStatus" ADD VALUE IF NOT EXISTS 'DELETED';
