/**
 * BloodBridge Hospital HMS Webhooks Controller
 */

import { Request, Response } from 'express';
import {
  registerWebhook,
  getWebhookDeliveries,
  dispatchWebhookEvent,
} from '../services/webhookService';

export function registerWebhookHandler(req: Request, res: Response): void {
  try {
    const hospitalId =
      req.user?.hospitalProfileId ||
      (req as any).user?.hospitalProfile?.id ||
      req.body.hospitalId;
    const { targetUrl, secretKey, events } = req.body;

    if (!hospitalId || !targetUrl || !secretKey) {
      res.status(400).json({
        success: false,
        error: 'hospitalId, targetUrl, and secretKey are required',
      });
      return;
    }

    const sub = registerWebhook({
      hospitalId,
      targetUrl,
      secretKey,
      events: Array.isArray(events) ? events : ['*'],
    });

    res.status(201).json({
      success: true,
      data: sub,
      message: 'Hospital HMS webhook endpoint registered successfully',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export function getDeliveriesHandler(req: Request, res: Response): void {
  try {
    const { subscriptionId } = req.params;
    if (!subscriptionId) {
      res.status(400).json({ success: false, error: 'Subscription identifier is required' });
      return;
    }

    const deliveries = getWebhookDeliveries(subscriptionId);
    res.json({
      success: true,
      data: deliveries,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export function testWebhookDispatchHandler(req: Request, res: Response): void {
  try {
    const hospitalId =
      req.user?.hospitalProfileId ||
      (req as any).user?.hospitalProfile?.id ||
      req.body.hospitalId;
    const { event, data } = req.body;

    if (!hospitalId || !event) {
      res.status(400).json({ success: false, error: 'hospitalId and event name are required' });
      return;
    }

    const attempts = dispatchWebhookEvent(event, hospitalId, data || { test: true });
    res.json({
      success: true,
      data: attempts,
      dispatchedCount: attempts.length,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
