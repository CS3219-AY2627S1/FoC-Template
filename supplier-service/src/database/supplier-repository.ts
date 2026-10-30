/*
Has information about the supplier database and its operations
TODO: Supplier_Database name should be interpolated as db_name

AI Declaration: Migration to drizzle for createSupplierService and updateSupplierService used
*/ 

import { db } from '@database/db'; //drizzle-orm
import { CreateSupplierSchema, PublicSupplier, SupplierCategory, SupplierWithHours, UpdateSupplierType, supplier, LocationSupplier} from '@data/schema';
import { UpdateOpeningHours, supplierOpeningHours} from '@data/opening-hours-schema';
import { getTableColumns, isNull, eq, and, sql, desc} from 'drizzle-orm';
import { BadRequestError, ConflictError, NotFoundError,  } from '@/middleware/errors';
import { isOpenStatus } from './repository-helpers';


const { deletedAt, ...publicSupplierColumns } = getTableColumns(supplier);

//drizzle wraps driver errors, so the postgres code sits on err.cause
const isDuplicateName = (err: any) => err?.code === '23505' || err?.cause?.code === '23505';
const isCheckViolation = (err: any) => err?.code === '23514' || err?.cause?.code === '23514';

export async function createSupplierService(input: CreateSupplierSchema): Promise<SupplierWithHours>  {
    const { openingHours, ...newSupplier } = input;
    
    try{
        return await db.transaction(async (tx) => {

            const [insertedSupplier] = await tx
                                        .insert(supplier)
                                        .values(newSupplier)
                                        .returning(publicSupplierColumns);

            const hours = await tx.insert(supplierOpeningHours)
                    .values(openingHours.map((h) => ({...h, supplierId: insertedSupplier.supplierId})))
                    .returning();
            //maps each opening hours input from 0 to 6 to an entry in second table e.g. {openingHours: {0: [closingTime: DateTime(type), openingTime: DateTime(type) ... 6:}}
            //mandate all 7 days to be stated on creation, no NA
            //also preserves duplicate error being the only 23505 error

            return {...insertedSupplier, openingHours: hours}
        });
    } catch(err) {
        if (isDuplicateName(err)) {
            throw new ConflictError(`Supplier "${newSupplier.name}" already exists`);
        }
        //the hours rows carry the same check constraint the nested PUT reports as 400,
        //so a disagreeing day must not surface here as an unhandled 500
        if (isCheckViolation(err)) {
            throw new BadRequestError(
                'Opening hours must either be closed with no times, or open with both opens_at and closes_at',
            );
        }
        throw err;
    }
}

export async function getSupplierByIdService(id: number): Promise<SupplierWithHours>  {

  const row = await db.query.supplier.findFirst({
    columns: {deletedAt: false},
    where: and(eq(supplier.supplierId, id), isNull(supplier.deletedAt)),
    with: {
        openingHours: {
            columns: { dayOfWeek: true, opensAt: true, closesAt: true, isClosed: true},
            orderBy: (h, { asc }) => [asc(h.dayOfWeek)]
        }}
  })
  

  if(!row) {
    //case error: No Suppliers Listed in DB 
    throw new NotFoundError(`Error 404: Supplier ${id} Not Found`);
  }
  return row;
}

export async function updateSupplierByIdService(id: number, updates: UpdateSupplierType, expectedUpdatedAt: Date): Promise<UpdateSupplierType>  {

    /*
    Parameters: 
        - supplier id: bigint or number referencing supplier
        - updates: drizzle-zod schema of "Supplier" class wrapped to ensure user cannot access fields e.g. deleted_at or updated_at
        - expectedUpdatedAt: read current updated_at of the supplier. implements supplier_versioning

    DB query
        - Checks whether supplier_id exists, if supplier version is the same as expected version, and supplier is not deleted
        - Sets supplier fields. Sets updatedAt to current date

    Response/Error Handling Cases
        - Supplier Id does not exist or Supplier is deleted [Error 400]
        - Current supplier updated at version does not match request body [Error 409]
        - Supplier name is duplicated [Error 409]
    */

    let updated; //declare variable in function scope

    try {
        updated = await db
            .update(supplier)
            .set({
                ...updates,
                updatedAt: new Date(),
            })
            .where(and(eq(supplier.supplierId, id), eq(supplier.updatedAt, expectedUpdatedAt), isNull(supplier.deletedAt)))
            .returning(publicSupplierColumns);
    } catch(err) {
        if (isDuplicateName(err)) {
            throw new ConflictError(`Supplier "${updates.name}" already exists`);
        }
        throw err;
    }

    //no row matched
    // causes: supplier deletion (not found err), stale data: updated by someone else, id does not exist(not found err)
    if (updated.length == 0 || !updated) {
        const [existing] = await db
            .select({ id: supplier.supplierId })
            .from(supplier)
            .where(and(eq(supplier.supplierId, id), isNull(supplier.deletedAt)));

        if (!existing) {
            throw new NotFoundError(`Supplier ${id} not found. Supplier is either deleted or does not exist.`);
        }
        throw new ConflictError('Conflict: Supplier was modified concurrently');
    }

    return updated[0];
}


export async function updateSupplierHoursByIdService(id: number, updates: UpdateOpeningHours):Promise<UpdateOpeningHours> {

    /*
    Parameters:
        - id: bigint or number referencing the parent supplier
        - updates: one day of opening hours. dayOfWeek selects the row, the remaining fields replace it

    DB query
        - Checks the parent supplier exists and is not soft deleted
        - Replaces opensAt/closesAt/isClosed for the (supplier_id, day_of_week) row

    Response/Error Handling Cases
        - Supplier id does not exist or supplier is deleted [Error 404]
        - Supplier has no row for that day [Error 404]
        - opensAt/closesAt disagree with isClosed, rejected by the table check constraint [Error 400]
    */

    //hours hang off the supplier, so a deleted parent must not be editable through the child table
    const [parent] = await db
        .select({ id: supplier.supplierId })
        .from(supplier)
        .where(and(eq(supplier.supplierId, id), isNull(supplier.deletedAt)));

    if (!parent) {
        throw new NotFoundError(`Supplier ${id} not found. Supplier is either deleted or does not exist.`);
    }

    let updated;

    try {
        //the three fields move as a unit, so replace all of them rather than patching one
        //updatedAt is left to the supplier_opening_hours_set_updated_at trigger
        updated = await db
            .update(supplierOpeningHours)
            .set({
                opensAt: updates.opensAt,
                closesAt: updates.closesAt,
                isClosed: updates.isClosed,
            })
            .where(and(
                eq(supplierOpeningHours.supplierId, id),
                eq(supplierOpeningHours.dayOfWeek, updates.dayOfWeek),
            ))
            .returning();
    } catch (err) {
        if (isCheckViolation(err)) {
            throw new BadRequestError(
                'Opening hours must either be closed with no times, or open with both opens_at and closes_at',
            );
        }
        throw err;
    }

    //creation mandates all 7 days, so a missing row means the day is out of range
    if (updated.length == 0) {
        throw new NotFoundError(`Supplier ${id} has no opening hours for day ${updates.dayOfWeek}`);
    }

    return updated[0];
}

//support soft delete
//edited to return the deleted supplier for better response messages
export async function deleteSupplierByIdService(id: number): Promise<PublicSupplier> {
    const [deleted] = await db
    .update(supplier)
    .set({ deletedAt: new Date() })
    .where(and(eq(supplier.supplierId, id), isNull(supplier.deletedAt)))
    .returning(publicSupplierColumns);
  if (!deleted) throw new NotFoundError(`Supplier ${id} not found`);
  return deleted;
}

//Might need to think about loading optimizations
//TODO: Order supplier loading based on location
export async function getAllSuppliersService(): Promise<PublicSupplier[]>{
    
    const suppliers = await db
      .select(publicSupplierColumns)
      .from(supplier)
      .where(isNull(supplier.deletedAt));
    return suppliers;
  }


//use drizzle-orm to standardize response to PublicSupplier type for UI integration
export async function searchSuppliersService(text: string): Promise<PublicSupplier[]> {
    const query = sql`websearch_to_tsquery('english', ${text})`;
    return db
      .select({ ...publicSupplierColumns, rank: sql<number>`ts_rank(fts, ${query})` })
      .from(supplier)
      .where(and(isNull(supplier.deletedAt), sql`fts @@ ${query}`))
      .orderBy(desc(sql`ts_rank(fts, ${query})`));
  }
  
  export async function filterSuppliersByCategoryService(
    supplierType: SupplierCategory,
  ): Promise<PublicSupplier[]>{
    return db
      .select(publicSupplierColumns)
      .from(supplier)
      .where(and(isNull(supplier.deletedAt), eq(supplier.type, supplierType)));
  }


export async function getNearbySuppliersService({ latitude, longitude, radius }: LocationSupplier): Promise<PublicSupplier[]> {
    const origin = sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;
    return db.query.supplier.findMany({
        columns: { deletedAt: false },
        where: and(
            isNull(supplier.deletedAt),
            sql`ST_DWithin(location, ${origin}, ${radius})`,
        ),
        orderBy: sql`ST_Distance(location, ${origin})`,
    });
}
