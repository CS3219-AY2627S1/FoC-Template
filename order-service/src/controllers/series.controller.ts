/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - series HTTP handlers, mirroring
 *        orders.controller.ts's createOrder/editOrder/statusFor patterns.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import type { RequestHandler } from 'express';
import type { PrismaClient } from '../db/prisma.js';
import { ErrorCode, ErrorMessage } from '../constants/errors.js';
import * as seriesService from '../services/series.service.js';
import { isUuid } from '../utils/validation.js';

function statusFor(errors: ErrorCode[]): number {
  if (errors.includes(ErrorCode.SERIES_NOT_FOUND)) return 404;
  if (errors.includes(ErrorCode.SERIES_CONFLICT)) return 409;
  if (errors.includes(ErrorCode.FORBIDDEN)) return 403;
  return 400;
}

export const createSeries =
  (prisma: PrismaClient): RequestHandler =>
  async (req, res) => {
    const requesterId = req.user?.user_id;
    if (!isUuid(requesterId)) {
      res.status(401).json({ message: ErrorMessage[ErrorCode.UNAUTHENTICATED] });
      return;
    }
    const result = await seriesService.createSeries(prisma, requesterId, req.body ?? {});
    if (!result.ok) {
      res.status(statusFor(result.errors)).json({
        message: result.errors.map((e) => ErrorMessage[e]).join('\n'),
      });
      return;
    }
    res.status(201).json(result.series);
  };

export const listMySeries =
  (prisma: PrismaClient): RequestHandler =>
  async (req, res) => {
    const requesterId = req.user?.user_id;
    if (!isUuid(requesterId)) {
      res.status(401).json({ message: ErrorMessage[ErrorCode.UNAUTHENTICATED] });
      return;
    }
    const series = await seriesService.listMySeries(prisma, requesterId);
    res.status(200).json({ ok: true, series });
  };

export const getSeries =
  (prisma: PrismaClient): RequestHandler =>
  async (req, res) => {
    const actorId = req.user?.user_id;
    if (!isUuid(actorId)) {
      res.status(401).json({ message: ErrorMessage[ErrorCode.UNAUTHENTICATED] });
      return;
    }
    const seriesId = req.params.seriesId as string;
    if (!isUuid(seriesId)) {
      res.status(404).json({ message: ErrorMessage[ErrorCode.SERIES_NOT_FOUND] });
      return;
    }
    const result = await seriesService.getSeries(prisma, actorId, seriesId);
    if (!result.ok) {
      res.status(statusFor(result.errors)).json({
        message: result.errors.map((e) => ErrorMessage[e]).join('\n'),
      });
      return;
    }
    res.status(200).json(result.series);
  };

export const editSeries =
  (prisma: PrismaClient): RequestHandler =>
  async (req, res) => {
    const actorId = req.user?.user_id;
    if (!isUuid(actorId)) {
      res.status(401).json({ message: ErrorMessage[ErrorCode.UNAUTHENTICATED] });
      return;
    }
    const seriesId = req.params.seriesId as string;
    if (!isUuid(seriesId)) {
      res.status(404).json({ message: ErrorMessage[ErrorCode.SERIES_NOT_FOUND] });
      return;
    }
    const result = await seriesService.editSeries(
      prisma,
      actorId,
      seriesId,
      req.body ?? {},
    );
    if (!result.ok) {
      res.status(statusFor(result.errors)).json({
        message: result.errors.map((e) => ErrorMessage[e]).join('\n'),
      });
      return;
    }
    res.status(200).json(result.series);
  };

export const deleteSeries =
  (prisma: PrismaClient): RequestHandler =>
  async (req, res) => {
    const actorId = req.user?.user_id;
    if (!isUuid(actorId)) {
      res.status(401).json({ message: ErrorMessage[ErrorCode.UNAUTHENTICATED] });
      return;
    }
    const seriesId = req.params.seriesId as string;
    if (!isUuid(seriesId)) {
      res.status(404).json({ message: ErrorMessage[ErrorCode.SERIES_NOT_FOUND] });
      return;
    }
    const result = await seriesService.deleteSeries(prisma, actorId, seriesId);
    if (!result.ok) {
      res.status(statusFor(result.errors)).json({
        message: result.errors.map((e) => ErrorMessage[e]).join('\n'),
      });
      return;
    }
    res.status(200).json({ ok: true });
  };
