export type FieldType = 'formData' | 'path' | 'query';
export type APIService = 'supplier' | 'user' | 'order' | 'credit';

export type EndpointConfigEntry = {
    service: APIService;
    url: string;
    verb: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
    fieldMap?: Record<string, FieldType>;
    keepalive?: boolean;
};

export type APIRequest = Record<string, unknown> | null;

export class CampusErrandsAPIError extends Error {
    status: number;
    data?: unknown;
    requestId?: string;

    constructor(message: string, status: number, data?: unknown, requestId?: string) {
        super(message);
        this.name = 'CampusErrandsAPIError';
        this.status = status;
        this.data = data;
        this.requestId = requestId;
    }
}
