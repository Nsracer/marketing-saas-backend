import { Router } from 'express';
const router = Router();
import healthController from '../controllers/healthController.js';

// POST /api/health/analyze - Analyze a website and return health score
router.post('/analyze', healthController.analyzeWebsite);

// GET /api/health/report/:domain - Get detailed health report for a domain
router.get('/report/:domain', healthController.getHealthReport);

export default router;