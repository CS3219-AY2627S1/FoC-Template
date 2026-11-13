import * as path from "@std/path";

export interface RandomNameOptions {
    wordCount?: number;
    numberDigits?: number;
    rng?: () => number;
}

const WORD_LIST_PATH = path.join(import.meta.dirname!, "../../data/bip-0039.txt");

export function loadWordList(path: string) {
    return Deno.readTextFileSync(path)
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
}

const defaultWordList = loadWordList(WORD_LIST_PATH);

function pick(arr: string[], rng: () => number) {
    return arr[Math.floor(rng() * arr.length)];
}

/**
 * Random integer string of digit count
 * */
function randomNumber(digits: number, rng: () => number) {
    return [...new Array(digits)]
        .map(_ => Math.floor(rng() * 10))
        .join("");
}

/**
 * Generate a random name from a word list
*/
function generateRandomNameFromList(wordList: string[], options: RandomNameOptions = {}) {
    if (wordList.length === 0)
        throw new Error("wordList should not be empty");

    const {
        wordCount = 2,
        numberDigits = 3,
        rng = Math.random,
    } = options;

    if (wordCount < 1) throw new Error("wordCount must be >= 1");

    const parts: string[] = [];
    for (let i = 0; i < wordCount; i++) {
        parts.push(pick(wordList, rng));
    }

    if (numberDigits > 0) {
        parts.push(randomNumber(numberDigits, rng));
    }

    return parts.join(" ");
}

/**
 * Generate a random name from the default bip-39 word list
 */
export function generateRandomName(options: RandomNameOptions = {}) {
    return generateRandomNameFromList(defaultWordList, options);
}
