import express from 'express';

import { getAllSuppliers, getSupplierById, deleteSupplierById, createSupplier, updateSupplierById, searchSuppliers, filterSuppliersByCategory, updateSupplierHours, getNearbySuppliers} from '@/api/supplier-controller';
import {validateRequest, ValidationSource} from '@/middleware/zod-validation';
import {createSupplierSchema, updateRequestSchema, supplierIdParamSchema, supplierCategoryQuerySchema, supplierRadiusQuerySchema} from "@data/schema";
import {openingHoursParamSchema, updateOpeningHoursBodySchema} from "@data/opening-hours-schema";
import { authenticate, requireRole, ADMINISTRATOR } from '@/middleware/jwt-validation';

  
//User Routes for Supplier Service
const supplierRouter = express.Router();

supplierRouter.post('/supplier', authenticate, requireRole(ADMINISTRATOR), validateRequest(createSupplierSchema, ValidationSource.BODY), createSupplier); 
supplierRouter.get('/supplier/:id', validateRequest(supplierIdParamSchema, ValidationSource.PARAM), getSupplierById);
supplierRouter.put('/supplier/:id', authenticate, requireRole(ADMINISTRATOR), validateRequest(supplierIdParamSchema, ValidationSource.PARAM), validateRequest(updateRequestSchema, ValidationSource.BODY),updateSupplierById);
supplierRouter.delete('/supplier/:id', authenticate, requireRole(ADMINISTRATOR), validateRequest(supplierIdParamSchema, ValidationSource.PARAM), deleteSupplierById); 
//body: {isClosed, opensAt, closesAt}. All three are required because the table's check
//constraint needs them to agree, so a day is replaced rather than patched field by field.
supplierRouter.put('/supplier/:id/openingHours/:dayOfWeek', authenticate, requireRole(ADMINISTRATOR), validateRequest(openingHoursParamSchema, ValidationSource.PARAM), validateRequest(updateOpeningHoursBodySchema, ValidationSource.BODY), updateSupplierHours);



//common user actions
supplierRouter.get('/suppliers', getAllSuppliers);
supplierRouter.get('/suppliers/search', searchSuppliers); 
supplierRouter.get('/suppliers/category', validateRequest(supplierCategoryQuerySchema, ValidationSource.QUERY), filterSuppliersByCategory);
//get all suppliers closest to me; query: {latitude, longitude, radius in metres}
supplierRouter.get('/suppliers/search-radius', validateRequest(supplierRadiusQuerySchema, ValidationSource.QUERY), getNearbySuppliers);

// get all open suppliers 
//supplierRouter.get('/supplier/:id/opening-hours')

//get all supppliers closest to me 
//supplierRouter.get('/suppliers/search-radius', getNearbySuppliers);
export default supplierRouter;
