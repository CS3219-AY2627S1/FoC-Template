import createApiClient from "./axios";

export const supplierApi = createApiClient(
    import.meta.env.VITE_SUPPLIER_API_BASE_URL,
);

export default supplierApi;
