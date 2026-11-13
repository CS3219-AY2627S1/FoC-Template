// AI-generated (edited by lolepop)

export interface ValidationErrorNode {
    error?: string;
    errors?: string[];
    properties?: Record<string, ValidationErrorNode>;
    items?: ValidationErrorNode[];
}

export interface ApiErrorResponse {
    error: string;
    details?: ValidationErrorNode;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Turns an API validation error payload into a human-readable, multi-line string.
 *
 * Example input:
 *   { error: "request schema violation",
 *     details: { errors: [], properties: {
 *       password: { errors: ["Too big: expected string to have <=128 characters"] } } } }
 *
 * Example output:
 *   request schema violation
 *   • password: Too big: expected string to have <=128 characters
 */
export function formatApiError(
    response: unknown,
    { indent = "  ", bullet = "• " }: { indent?: string; bullet?: string } = {}
): string {
    if (!isObject(response)) return String(response);

    const header = typeof response.error === "string" ? response.error : "Unknown error";
    const lines: string[] = [];

    const walk = (node: unknown, path: string[], depth: number): void => {
        if (!isObject(node)) return;

        // Indent nested levels, but keep the first level of properties flush-left.
        const pad = indent.repeat(Math.max(0, depth - 1));

        // Leaf errors for this node
        const errors = Array.isArray(node.errors) ? node.errors : [];
        for (const msg of errors) {
        const label = path.length ? `${path.join(".")}: ` : "";
        lines.push(`${pad}${bullet}${label}${msg}`);
        }

        // Recurse into object properties
        if (isObject(node.properties)) {
            for (const [key, child] of Object.entries(node.properties)) {
                walk(child, [...path, key], depth + 1);
            }
        }

        // Recurse into array items
        if (Array.isArray(node.items)) {
            node.items.forEach((child, i) => {
                walk(child, [...path, String(i)], depth + 1);
            });
        }
    };

    walk(response.details, [], 0);

    return lines.length > 0 ? [header, ...lines].join("\n") : header;
}