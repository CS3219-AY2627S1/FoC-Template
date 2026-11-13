import { status } from '@grpc/grpc-js';
import { SupplierService, createServer, type SupplierServiceHandlers } from '@foc/grpc';

type GetSupplierHandler = SupplierServiceHandlers['GetSupplier'];

//Defined to handle errors in gRPC! 
function parseSupplierId(supplierId: string): number | undefined {
  const id = Number(supplierId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return undefined;
  }
  return id;
}

const GetSupplier: GetSupplierHandler = (call, callback) => {
  void handleGetSupplier(call, callback);
};



//SO far im returning supplierId, name, building name, floor, location for the order service
async function handleGetSupplier(...[call, callback]: Parameters<GetSupplierHandler>): Promise<void> {
  const id = parseSupplierId(call.request.supplierId);
  if (id === undefined) {
    callback({ code: status.INVALID_ARGUMENT, details: 'supplier_id must be a positive integer' });
    return;
  }

  try {
    // lazy so createGrpcServer() does not open a database pool
    const { getSupplierByIdService } = await import('@/database/supplier-repository');
    const { NotFoundError } = await import('@/middleware/errors');
    try {
      const row = await getSupplierByIdService(id);
      callback(null, {
        supplierId: String(row.supplierId),
        name: row.name,
        buildingName: String(row.buildingName), 
        floor: Number(row.floor),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        callback({ code: status.NOT_FOUND, details: err.message });
        return;
      }
      throw err;
    }
  } catch (err) {
    console.error(err);
    callback({ code: status.INTERNAL, details: 'internal' }); //assume other errors are internal errors!
    //TODO: evaluate error handling in integration tests with order
  }
}


export const handlers: SupplierServiceHandlers = {
  GetSupplier,
};

export function createGrpcServer() {
  return createServer(SupplierService.service, handlers);
}
