import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {readConfig} from '../src/config.js';

const environment = {
    NODE_ENV: 'development',
    AWS_REGION: 'ap-southeast-1',
    JWKS_URL: 'http://localhost:8080/api/.well-known/jwks.json',
    SQS_QUEUE_URL: 'http://localhost:4566/000000000000/foc-dev-realtime-events',
};

describe('realtime config', () => {
    it('reads the explicit startup environment', () => {
        assert.deepEqual(readConfig(environment), {
            isDevelopment: true,
            jwksUrl: environment.JWKS_URL,
            queueUrl: environment.SQS_QUEUE_URL,
            region: 'ap-southeast-1',
            endpoint: undefined,
        });
    });

    it('resolves runtime and AWS endpoint overrides', () => {
        const config = readConfig({
            ...environment,
            NODE_ENV: 'production',
            AWS_REGION: 'eu-west-1',
            AWS_ENDPOINT_URL: 'http://floci:4566',
        });
        assert.equal(config.isDevelopment, false);
        assert.equal(config.region, 'eu-west-1');
        assert.equal(config.endpoint, 'http://floci:4566');
    });

    it('rejects missing startup configuration', () => {
        for (const key of ['NODE_ENV', 'AWS_REGION', 'JWKS_URL', 'SQS_QUEUE_URL']) {
            assert.throws(() => readConfig({...environment, [key]: undefined}), `Missing ${key} must fail`);
        }
    });

    it('rejects invalid startup values', () => {
        assert.throws(() => readConfig({...environment, NODE_ENV: 'prodution'}));
        assert.throws(() => readConfig({...environment, JWKS_URL: 'not-a-url'}));
        assert.throws(() => readConfig({...environment, SQS_QUEUE_URL: 'not-a-url'}));
        assert.throws(() => readConfig({...environment, AWS_ENDPOINT_URL: 'not-a-url'}));
    });
});
