// For example, "PENDING_RESERVATION" will be formatted to "Pending reservation"
export function formatStringToSentenceCase(str: String): string {
    const cleaned = str.replace(/_/g, ' ').toLowerCase();
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// For example, "PENDING_RESERVATION" will be formatted to "Pending Reservation"
export function formatStringToTitleCase(str: String): string {
    return str
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}