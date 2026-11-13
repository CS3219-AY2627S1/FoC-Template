local record, requests, attempts, pendingKey = KEYS[1], KEYS[2], KEYS[3], KEYS[4]
local action, challenge, otpHash, token = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local otpTTL, window = tonumber(ARGV[5]), tonumber(ARGV[6])
local maxRequests, maxAttempts = tonumber(ARGV[7]), tonumber(ARGV[8])

local function reject(reason, retryAfter)
  return cjson.encode({ok = false, reason = reason, retryAfterSeconds = retryAfter})
end

if action == 'cancel' then
  if redis.call('HGET', record, 'token') == token then
    redis.call('DEL', record)
  end
  return cjson.encode({ok = true})
end

local failures = tonumber(redis.call('GET', attempts) or '0')
if failures >= maxAttempts then
  return reject('locked', redis.call('TTL', attempts))
end

if action == 'send' then
  local time = redis.call('TIME')
  local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
  redis.call('ZREMRANGEBYSCORE', requests, '-inf', now - window * 1000)
  if redis.call('ZCARD', requests) >= maxRequests then
    local oldest = redis.call('ZRANGE', requests, 0, 0, 'WITHSCORES')
    return reject('throttled', math.ceil((tonumber(oldest[2]) + window * 1000 - now) / 1000))
  end

  redis.call('ZADD', requests, now, token)
  redis.call('EXPIRE', requests, window)
  redis.call('HSET', record, 'challengeId', challenge, 'otpHash', otpHash, 'token', token)
  redis.call('EXPIRE', record, otpTTL)
  return cjson.encode({ok = true})
end

if redis.call('EXISTS', record) == 0 then return reject('missing') end
if redis.call('HGET', record, 'challengeId') ~= challenge then return reject('challenge') end

if redis.call('HGET', record, 'otpHash') ~= otpHash then
  local count = redis.call('INCR', attempts)
  -- Resending an OTP does not reset this session's failed attempts.
  -- The failure counter/lock lasts ten minutes from the first failure.
  if count == 1 then redis.call('EXPIRE', attempts, window) end
  if count >= maxAttempts then return reject('locked', redis.call('TTL', attempts)) end
  return reject('mismatch')
end

-- Register verify: pending must still be present or we refuse without consuming the OTP.
local pending
if pendingKey and pendingKey ~= '' then
  pending = redis.call('GET', pendingKey)
  if not pending then return reject('missing') end
  redis.call('DEL', record, attempts, pendingKey)
  return cjson.encode({ok = true, pending = pending})
end

redis.call('DEL', record, attempts)
return cjson.encode({ok = true})
