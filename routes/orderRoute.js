import express from 'express';
import { optimizeGarmentCutting } from '../controllers/orderController.js';

const orderRoute = express.Router();

orderRoute.post('/optimize-cutting', optimizeGarmentCutting);

export default orderRoute;