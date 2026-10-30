//Standardize the controller responses for the UI

import { Request, Response, NextFunction } from 'express';
import {getSupplierByIdService, 
    updateSupplierByIdService, deleteSupplierByIdService, 
    getAllSuppliersService, 
    createSupplierService, 
    searchSuppliersService, 
    filterSuppliersByCategoryService,
    getNearbySuppliersService,
    updateSupplierHoursByIdService,}  from '@/database/supplier-repository';

import { SUPPLIER_CATEGORY, supplierRadiusQuerySchema, updateRequestSchema } from '@/data/schema';

const handleResponse = (res: Response, status: number, data: any, message: string) => {
    res.status(status).json({
        data,
        message
    });
};

export default handleResponse;

export const getAllSuppliers = async(req:Request, res:Response, next:NextFunction) => {
    try {
        const suppliers = await getAllSuppliersService();
        handleResponse(res, 200, suppliers, 'All suppliers fetched successfully');
    } catch (err) {
        next(err);
    }
 };


export const getSupplierById = async(req:Request, res:Response, next:NextFunction) => {
    try {
        const supplierId = await getSupplierByIdService(Number(req.params.id));
        const id_value = Number(req.params.id);
        handleResponse(res, 200, supplierId, `Supplier ${id_value} fetched successfully`);
    } catch (err) {
        next(err);
    }
 };


export const deleteSupplierById = async(req:Request, res:Response, next:NextFunction) => {
    try {
        const deletedSupplier = await deleteSupplierByIdService(Number(req.params.id));
        const id_value = Number(req.params.id);
        handleResponse(res, 200, deletedSupplier, `Supplier ${id_value} deleted from active supplier list successfully`);
    } catch (err) {
        next(err);
    }
 };

 export const createSupplier = async(req:Request, res:Response, next:NextFunction) => {
    try {
        const newSupplier = await createSupplierService(req.body);
        const newSupplierName = req.body.name;
        handleResponse(res, 201, newSupplier, `Successful. New supplier created`);
    } catch(err) {
        next(err);
    }
}

export const updateSupplierById = async(req:Request, res:Response, next:NextFunction) => {
    try {
        const { expectedUpdatedAt, ...updateData } = updateRequestSchema.parse(req.body);

        const updatedSupplier = await updateSupplierByIdService(Number(req.params.id), updateData, expectedUpdatedAt);

        handleResponse(res, 200, updatedSupplier, `Supplier ${req.params.id} was updated`);
    } catch(err) {
        next(err);
    }
}

//Supports supplier search for building, location description, and name
export const searchSuppliers = async(req:Request, res:Response, next:NextFunction) => {
   try {
       const searchText = String(req.query.q ?? ''); //replaced body with .query.q and also included nullish operator ??
       const supplierList = await searchSuppliersService(searchText);
       handleResponse(res, 200, supplierList, `Supplier list for ${searchText} search input returned`)
   } catch(err) {
    next(err);
   }
} 

//Supports supplier filtering by category
export const filterSuppliersByCategory = async(req:Request, res:Response, next:NextFunction) => {
    try {
        const category = SUPPLIER_CATEGORY.parse(req.query.type); //replaced body with query here
        const supplierList = await filterSuppliersByCategoryService(category);
        handleResponse(res, 200, supplierList, `Supplier list for ${category} category returned`)
    } catch(err) {
     next(err);
    }
} 

export const updateSupplierHours = async(req:Request, res:Response, next:NextFunction) => {

    //day_of_week is 0 = Sunday in the database, so the labels start there too
    const DAY_OF_WEEK = ["Sunday","Monday","Tuesday","Wednesday","Thursday", "Friday","Saturday"]


    try {
        const dayOfWeek = Number(req.params.dayOfWeek)
        const dayOfWeekString = DAY_OF_WEEK[dayOfWeek]; //the number value 0-6
    
        const updatedHours = await updateSupplierHoursByIdService
                                    (Number(req.params.id), 
                                    {...req.body, 
                                        dayOfWeek,});
        handleResponse(res, 200, updatedHours, `Supplier ${req.params.id} hours successfully updated for ${dayOfWeekString}`)
    }
    catch(err) {
        next(err);
    }
}


export const getNearbySuppliers = async(req:Request, res:Response, next:NextFunction) => {
    try {
        const locationQuery = supplierRadiusQuerySchema.parse(req.query);
        const nearbySuppliers = await getNearbySuppliersService({...locationQuery});
        handleResponse(res, 200, nearbySuppliers, `Nearby suppliers within ${req.query.radius} meters fetched successfully`);
    } catch (err) {
        next(err);
    }
}
