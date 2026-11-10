import type { EndpointConfigEntry } from './models';

export type OrderDemoControls = {
    /** Discard exactly one successful order-creation response, after the server processes it. */
    dropNextCreateResponse: () => void;
    /** Pause automatic refreshes on the Orders page in this browser tab. */
    stopPollingOrder: () => void;
    resumePollingOrder: () => void;
};

declare global {
    interface Window {
        orderDemo?: OrderDemoControls;
    }
}

let dropNext = false;
let pollingStopped = false;
let pollingGeneration = 0;

export const orderPollingGeneration = (): number => pollingGeneration;
export const canApplyOrderPoll = (generation: number): boolean =>
    !pollingStopped && generation === pollingGeneration;

if (typeof window !== 'undefined') {
    window.orderDemo = Object.freeze({
        stopPollingOrder: () => {
            pollingStopped = true;
            pollingGeneration++;
            console.info('[order-demo] Orders polling paused. Actions still reach the server.');
        },
        resumePollingOrder: () => {
            pollingStopped = false;
            console.info('[order-demo] Orders polling resumed; refresh occurs on the next polling tick.');
        },
        dropNextCreateResponse: () => {
            dropNext = true;
            console.info('[order-demo] Armed: the next successful order creation response will be discarded.');
        },
    });
}

/** Called only after the transport has received and validated a successful response. */
export const consumeOrderCreateResponseLoss = (config: EndpointConfigEntry): boolean => {
    if (!dropNext || config.service !== 'order' || config.verb !== 'POST' || config.url !== '/orders') {
        return false;
    }
    dropNext = false;
    console.info('[order-demo] Creation succeeded; response deliberately discarded. The UI must retry with the same idempotency key.');
    return true;
};
