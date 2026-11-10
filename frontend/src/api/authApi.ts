import createApiClient from "./axios";

const authApi = createApiClient(
    import.meta.env.VITE_AUTH_API_BASE_URL,
);

export default authApi;