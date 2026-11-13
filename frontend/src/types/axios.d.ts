import "axios";

declare module "axios" {
    export interface AxiosRequestConfig {
        shouldSkipAuthHeader?: boolean
    }
}
