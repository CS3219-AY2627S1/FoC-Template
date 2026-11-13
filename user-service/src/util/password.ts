export function analysePasswordCategories(str: string) {
    const patterns = {
        uppercase: /[A-Z]/,
        lowercase: /[a-z]/,
        digits: /[0-9]/,
        special: /[^A-Za-z0-9]/
    };

    const count = Object.fromEntries(
        Object.keys(patterns)
            .map(k => [k, 0])
    );

    for (const char of str) {
        for (const [type, regex] of Object.entries(patterns)) {
            if (regex.test(char)) {
                count[type] ??= 0;
                count[type]++;
                break;
            }
        }
    }

    const uniqueCategoriesPresent = Object.values(count).filter(c => c > 0).length;
    return { count, uniqueCategoriesPresent };
};
