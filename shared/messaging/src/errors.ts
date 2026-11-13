//Retry error for data validation 
//Prevents known invalid data from being retried and clogging the queue

//AI Declaration: Some autocomplete for comments. Pretty much what I wanted to say
//By @sunpterodactyl

/*
Make sure to import this class in your service's queue handler 
and throw it when you want to prevent a message from being retried.
*/

export class NonRetryableError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'NonRetryableError';
    // Keeps `instanceof` working if the TS target is older than ES2015.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/*
This function works with strings that are possibly thrown by a 
handler and converts them to an Error object. 
This is useful for logging and error handling.
*/
export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
