export interface IOrderServiceClient {
    /**
     * Whether any errand that is not yet completed, cancelled or expired uses
     * one of these suppliers (FR 5.8)
     */
    hasOngoingErrands(supplierIds: number[]): Promise<boolean>;
}

// TODO: call the order service once it exists. Until then no errands can reference
// a supplier, so every delete is allowed
export const defaultOrderServiceClient: IOrderServiceClient = {
    hasOngoingErrands: () => Promise.resolve(false),
};
