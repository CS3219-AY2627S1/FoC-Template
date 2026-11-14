<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-04
Scope: Recorded the verbatim output of one local k6 run of test/load/pagination.k6.js, with the environment
       it ran in. No requirements, architecture, schema, or API decisions were made by the AI tool.
Author review: Congchen
-->
# Phase 5 pagination load test: local run, 2026-11-04

**Result: the team's NFR7.1 targets were NOT met in this run.** Under the 50 and 200 requests/s arrival rates the service answered at roughly 20 requests/s, k6 dropped 11,672 iterations, and every percentile was far above its limit. No index or query was changed (Phase 5 plan Task 3 step 4); the numbers are reported for the team to decide.

## Environment (what actually ran)

- All on one Windows laptop: Supplier Service (`npx tsx src/app.ts`, development mode, a single Node process), MySQL 8 and Redis 7 in Docker containers, and k6 (`grafana/k6` Docker image, reaching the service through `host.docker.internal`). Load generator, service and database therefore competed for the same machine's CPU.
- Database: a separate MySQL database seeded by `scripts/seedLoadTestData.ts` with 4,000 synthetic suppliers (17,400 hours rows, 5,334 category links, 8,000 photo rows), 10 locations, 5 categories. Names contain `errand` for 1 in 5 rows. This is synthetic data, not the CSV seed.
- Auth: local JWKS stub (`scripts/loadTestAuth.ts`) with test-only keys. `PER_IP_RATE_LIMIT=20000`. No 429 responses occurred (all 3,330 responses were 200).
- Script: `test/load/pagination.k6.js` with `CATEGORY_ID=1`, `LOCATION_ID=1`.
- One single-request check before the run: the `isOpen=true` list query took 3.46 s by itself (cold, one request), versus 0.016 to 0.32 s for the other variants. This is one measurement, not a diagnosis.

## k6 output (verbatim excerpt)

```
  █ THRESHOLDS 

    checks
    ✓ 'rate==1' rate=100.00%

    dropped_iterations
    ✗ 'count==0' count=11672

    http_req_duration{scenario:peak,expected_response:true}
    ✗ 'p(50)<=400' p(50)=15.21s
    ✗ 'p(95)<=600' p(95)=17.09s

    http_req_duration{scenario:typical,expected_response:true}
    ✗ 'p(50)<=300' p(50)=8.7s
    ✗ 'p(95)<=500' p(95)=11.03s

    http_req_failed
    ✓ 'rate==0' rate=0.00%


  █ TOTAL RESULTS 

    checks_total.......: 3330    20.184254/s
    checks_succeeded...: 100.00% 3330 out of 3330
    checks_failed......: 0.00%   0 out of 3330

    ✓ response is 200

    HTTP
    http_req_duration...............................: avg=11.89s min=107.4ms  med=12.38s max=18.57s p(90)=16.36s p(95)=16.64s
      { expected_response:true }....................: avg=11.89s min=107.4ms  med=12.38s max=18.57s p(90)=16.36s p(95)=16.64s
      { scenario:peak,expected_response:true }......: avg=14.2s  min=107.4ms  med=15.21s max=18.57s p(90)=16.53s p(95)=17.09s
      { scenario:typical,expected_response:true }...: avg=8.68s  min=5.05s    med=8.7s   max=12.77s p(90)=10.62s p(95)=11.03s
    http_req_failed.................................: 0.00%  0 out of 3330
    http_reqs.......................................: 3330   20.184254/s

    EXECUTION
    dropped_iterations..............................: 11672  70.747931/s
    iteration_duration..............................: avg=11.9s  min=163.21ms med=12.44s max=18.57s p(90)=16.36s p(95)=16.64s
    iterations......................................: 3330   20.184254/s
    vus.............................................: 37     min=0         max=400
    vus_max.........................................: 400    min=400       max=400

    NETWORK
    data_received...................................: 69 MB  416 kB/s
    data_sent.......................................: 2.0 MB 12 kB/s




```

Thresholds crossed: `dropped_iterations`, `http_req_duration` for both scenarios.
