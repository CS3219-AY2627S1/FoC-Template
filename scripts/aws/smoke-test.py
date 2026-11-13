"""Deployment checks. Creates one disposable test user; never prints credentials."""
import base64
import json
import secrets
import sys
import time
import urllib.error
import urllib.request

base = sys.argv[1].rstrip('/')

def request(path, data=None, token=None, method=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(base + path, data=json.dumps(data).encode() if data is not None else None, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read().decode()
            try:
                body = json.loads(raw)
            except json.JSONDecodeError:
                body = raw
            return response.status, body
    except urllib.error.HTTPError as error:
        return error.code, None

credentials = {'email': 'deployment-check-' + secrets.token_hex(5) + '@example.com', 'password': 'Test!9' + secrets.token_hex(16)}
status, _ = request('/api/public/user/auth/register', credentials)
assert status == 200, f'register returned {status}'
print('PASS registration', flush=True)
status, tokens = request('/api/public/user/auth/login', credentials)
assert status == 200 and tokens.get('accessToken'), f'login returned {status}'
token = tokens['accessToken']
payload = token.split('.')[1]
user_id = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['sub']
print('PASS login', flush=True)
status, refreshed = request('/api/public/user/auth/refresh', {'refreshToken': tokens['refreshToken']})
assert status == 200 and refreshed.get('accessToken'), f'refresh returned {status}'
print('PASS token refresh', flush=True)
for label, path in [
    ('user database', '/api/public/user/user/' + user_id),
    ('supplier database', '/api/public/supplier/suppliers/'),
    ('order database', '/api/public/order/orders/?scope=requested'),
]:
    status, result = request(path, token=token)
    assert status == 200, f'{label} returned {status}'
    print('PASS ' + label, flush=True)
for attempt in range(15):
    status, credits = request('/api/public/credit/credits/' + user_id + '/balance', token=token)
    if status == 200:
        break
    time.sleep(2)
assert status == 200 and credits['balance'] == 100, f'credit initialization returned {status}'
print('PASS credit database and initial balance', flush=True)
status, _ = request('/api/private/user/auth/invite', {})
assert status == 403, f'private route unexpectedly returned {status}'
print('PASS private API blocked', flush=True)
print('Test user ID: ' + user_id)

if '--errand' in sys.argv:
    status, locations = request('/api/public/supplier/locations/', token=token)
    assert status == 200 and locations, 'Demo locations are required'
    location_id = locations[0]['id']
    courier_credentials = {'email': 'deployment-courier-' + secrets.token_hex(5) + '@example.com', 'password': 'Test!9' + secrets.token_hex(16)}
    status, _ = request('/api/public/user/auth/register', courier_credentials)
    assert status == 200, f'courier registration returned {status}'
    status, courier_tokens = request('/api/public/user/auth/login', courier_credentials)
    assert status == 200, f'courier login returned {status}'
    courier_token = courier_tokens['accessToken']
    payload = courier_token.split('.')[1]
    courier_id = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))['sub']
    status, order = request('/api/public/order/orders/', {
        'pickupType': 'BUILDING', 'pickupLocationId': location_id, 'pickupFloor': 1,
        'dropoffLocationId': location_id, 'dropoffFloor': 2,
        'itemDescription': 'Deployment integration test - no physical delivery', 'creditBounty': 1,
    }, token=token)
    assert status == 201, f'create errand returned {status}'
    order_path = '/api/public/order/orders/' + str(order['id'])
    for attempt in range(30):
        status, current = request(order_path, token=token)
        if status == 200 and current['status'] == 'OPEN':
            break
        time.sleep(2)
    assert status == 200 and current['status'] == 'OPEN', 'Queue did not confirm credit hold'
    print('PASS order creation, supplier lookup and asynchronous credit hold', flush=True)
    for target in ('ACCEPTED', 'COLLECTED', 'DELIVERED'):
        status, _ = request(order_path + '/status', {'targetStatus': target}, courier_token, 'PATCH')
        assert status == 200, f'{target} returned {status}'
    for attempt in range(30):
        status, courier_balance = request('/api/public/credit/credits/' + courier_id + '/balance', token=courier_token)
        if status == 200 and courier_balance['balance'] == 101:
            break
        time.sleep(2)
    assert status == 200 and courier_balance['balance'] == 101, 'Courier payout not received'
    status, requester_balance = request('/api/public/credit/credits/' + user_id + '/balance', token=token)
    assert status == 200 and requester_balance['balance'] == 99, 'Requester balance incorrect'
    print('PASS accept, collect, deliver and asynchronous credit payout', flush=True)
    print('Completed test order: ' + str(order['id']))
