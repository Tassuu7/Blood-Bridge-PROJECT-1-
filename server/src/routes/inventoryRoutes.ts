import { Router } from 'express';
import {
  getInventoryHandler,
  restockInventoryHandler,
  reserveInventoryHandler,
  releaseInventoryHandler,
  dispenseInventoryHandler,
} from '../controllers/inventoryController';
import { authenticateToken, requireRoles } from '../middleware/auth';

export const inventoryRoutes = Router();

// Hospital and Admin can query and manage inventory
inventoryRoutes.get('/', authenticateToken, requireRoles(['HOSPITAL', 'ADMIN']), getInventoryHandler);
inventoryRoutes.post('/restock', authenticateToken, requireRoles(['HOSPITAL', 'ADMIN']), restockInventoryHandler);
inventoryRoutes.post('/reserve', authenticateToken, requireRoles(['HOSPITAL', 'ADMIN']), reserveInventoryHandler);
inventoryRoutes.post('/release', authenticateToken, requireRoles(['HOSPITAL', 'ADMIN']), releaseInventoryHandler);
inventoryRoutes.post('/dispense', authenticateToken, requireRoles(['HOSPITAL', 'ADMIN']), dispenseInventoryHandler);
