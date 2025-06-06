import express from 'express';
import ocrRoutes from './v1/ocr.routes.js';
import retrievalRoutes from './v1/retrieval.routes.js';
import knowledgeRoutes from './v1/knowledge.routes.js';
import adminRoutes from './v1/admin.routes.js';
import productRoutes from './v1/product.routes.js';
import salaryRoutes from './v1/salary.routes.js';
import userRoutes from './v1/user.routes.js';
import webhookFaceRoutes from './v1/webhookFB.routes.js';
import webhookLineRoutes from './v1/webhookLINE.routes.js';

const router = express.Router();

const defaultRoutes = [
  { path: '/ocr', route: ocrRoutes },
  { path: '/external-knowledge', route: retrievalRoutes },
  { path: '/knowledge', route: knowledgeRoutes },
  { path: '/admin', route: adminRoutes },
  { path: '/product', route: productRoutes },
  { path: '/salary', route: salaryRoutes },
  { path: '/user', route: userRoutes },
  { path: '/webhookFB', route: webhookFaceRoutes },
  { path: '/webhookLINE', route: webhookLineRoutes },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;

