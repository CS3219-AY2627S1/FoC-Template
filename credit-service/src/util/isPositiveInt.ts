export function isPositiveInt(value: unknown): value is number {
    return typeof value === "number"
        && Number.isSafeInteger(value)
        && value > 0;
}
