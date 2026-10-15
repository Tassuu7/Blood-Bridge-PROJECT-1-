import { Router } from 'express';
import {
  createBloodRequest,
  getBloodRequests,
  getBloodRequestById,
  markBloodReceived,
  triggerManualEscalation,
  cancelBloodRequestHandler,
} from '../controllers/requestsController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Public/authenticated queries
router.get('/', getBloodRequests);
router.get('/:id', getBloodRequestById);

// Protected mutations
router.post('/', authenticateToken, createBloodRequest);
router.post('/:id/complete', authenticateToken, markBloodReceived);
router.post('/:id/escalate', authenticateToken, triggerManualEscalation);
router.post('/:id/cancel', authenticateToken, cancelBloodRequestHandler);

export default router;
