import createApiClient from "./axios";

const orderApi = createApiClient(
    import.meta.env.VITE_ORDER_API_BASE_URL,
);

export default orderApi;