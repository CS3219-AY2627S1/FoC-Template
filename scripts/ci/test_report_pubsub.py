"""Report saga provisioning regression tests. No credentials or network access.

AI assistance: OpenAI Codex, 2026-10-30; human review required.
Run directly or through test-order-workflows.py (the existing CI entry point).
"""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
FAKE = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
a = sys.argv[1:]
if '--project' in a:
    i = a.index('--project'); del a[i:i+2]
a = [x for x in a if x != '--quiet']
p = Path(os.environ['FAKE_REPORT_STATE']); d = json.loads(p.read_text())
d['calls'].append(a)
def value(flag): return a[a.index(flag)+1]
result = 0
if a[:3] == ['iam', 'service-accounts', 'describe']:
    result = 0 if a[3] in d['accounts'] else 1
elif a[:3] == ['iam', 'service-accounts', 'create']:
    email = a[3] + '@protean-vigil-509704-q4.iam.gserviceaccount.com'
    if email not in d['accounts']: d['accounts'].append(email)
elif a[:3] == ['pubsub', 'topics', 'describe']:
    result = 0 if a[3] in d['topics'] else 1
elif a[:3] == ['pubsub', 'topics', 'create']:
    d['topics'].append(a[3])
elif a[:3] == ['pubsub', 'subscriptions', 'describe']:
    result = 0 if a[3] in d['subscriptions'] else 1
    if not result: print('projects/protean-vigil-509704-q4/topics/' + d['subscriptions'][a[3]]['topic'])
elif a[:3] == ['pubsub', 'subscriptions', 'create']:
    d['subscriptions'][a[3]] = {'topic': value('--topic')}
    if '--push-endpoint' in a: d['subscriptions'][a[3]]['push'] = a
elif a[:3] == ['pubsub', 'subscriptions', 'modify-push-config']:
    d['subscriptions'][a[3]]['push'] = a
elif a[:3] == ['run', 'services', 'describe']:
    result = 1 if d.get('missing_service') == a[3] else 0
elif a[:2] == ['services', 'enable'] or a[:3] == ['beta', 'services', 'identity']:
    pass
elif len(a) > 2 and a[2] in ['add-iam-policy-binding', 'update']:
    pass
else:
    print('Unexpected fake CLI call: ' + repr(a), file=sys.stderr); result = 9
p.write_text(json.dumps(d)); sys.exit(result)
'''


class ReportCloudWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        folder = Path(self.temp.name)
        cli = folder / 'gcloud'
        cli.write_text(FAKE)
        cli.chmod(0o755)
        self.state = folder / 'state.json'
        self.write({'accounts': [], 'topics': [], 'subscriptions': {}, 'calls': []})
        self.env = dict(os.environ, PATH=str(folder) + os.pathsep + os.environ['PATH'],
                        FAKE_REPORT_STATE=str(self.state))

    def write(self, state):
        self.state.write_text(json.dumps(state))

    def check_bucket_privacy(self, metadata, allowed=True, readable=True):
        source = (ROOT / 'scripts/ci/check-infra.sh').read_text()
        block = source.split('echo "Reporting Service private attachment buckets"', 1)[1]
        block = block.split('if [[ ${#problems[@]} -gt 0 ]]', 1)[0]
        member = 'serviceAccount:foc-reporting-service@protean-vigil-509704-q4.iam.gserviceaccount.com'
        policy = {'bindings': [{'role': 'roles/storage.objectAdmin', 'members': [member]}]} if allowed else {}
        program = '''set -euo pipefail
PROJECT_ID=protean-vigil-509704-q4
environments=(staging production)
problems=()
runtime_sa() { echo "foc-$1@$PROJECT_ID.iam.gserviceaccount.com"; }
problem() { problems+=("$1"); echo "$1"; }
ok() { echo "$1"; }
gcloud() {
  case "$*" in
    *get-iam-policy*) [[ $BUCKET_IAM_READABLE == true ]] || return 1; printf '%s' "$BUCKET_IAM" ;;
    *describe*) printf '%s' "$BUCKET_METADATA" ;;
    *) return 1 ;;
  esac
}
''' + block + '\nexit "${#problems[@]}"'
        return subprocess.run(['bash', '-c', program], text=True, capture_output=True,
                              env=dict(self.env, BUCKET_METADATA=json.dumps(metadata),
                                       BUCKET_IAM=json.dumps(policy),
                                       BUCKET_IAM_READABLE=str(readable).lower()))

    def test_bucket_check_accepts_gcloud_storage_metadata(self):
        result = self.check_bucket_privacy({'public_access_prevention': 'enforced'})
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)
        self.assertEqual(2, result.stdout.count('is private and bucket-scoped object access is granted'))

    def test_bucket_check_accepts_nested_api_metadata(self):
        result = self.check_bucket_privacy({'iamConfiguration': {'publicAccessPrevention': 'enforced'}})
        self.assertEqual(0, result.returncode, result.stdout + result.stderr)

    def test_bucket_check_rejects_missing_or_unenforced_protection(self):
        for metadata in [{}, {'public_access_prevention': 'inherited'}]:
            with self.subTest(metadata=metadata):
                result = self.check_bucket_privacy(metadata)
                self.assertEqual(2, result.returncode, result.stdout + result.stderr)
                self.assertEqual(2, result.stdout.count('does not enforce public-access prevention'))

    def test_bucket_check_still_requires_runtime_object_access(self):
        result = self.check_bucket_privacy({'public_access_prevention': 'enforced'}, allowed=False)
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertEqual(2, result.stdout.count('has no object access'))

    def test_bucket_check_distinguishes_unreadable_policy_from_missing_runtime_access(self):
        result = self.check_bucket_privacy({'public_access_prevention': 'enforced'}, readable=False)
        self.assertEqual(2, result.returncode, result.stdout + result.stderr)
        self.assertEqual(2, result.stdout.count('CI cannot read bucket IAM policy'))
        self.assertIn('storage.buckets.getIamPolicy', result.stdout)
        self.assertNotIn('has no object access', result.stdout)

    def test_infrastructure_reader_can_inspect_bucket_policy_without_object_access(self):
        source = (ROOT / 'infra/gcp/bootstrap.sh').read_text()
        permissions = set(re.search(r'^reader_permissions="([^"]+)"', source, re.M)[1].split(','))
        self.assertIn('storage.buckets.get', permissions)
        self.assertIn('storage.buckets.getIamPolicy', permissions)
        self.assertFalse(any(p.startswith('storage.objects.') or p == 'storage.buckets.setIamPolicy'
                             for p in permissions))

    def run_script(self, environment='staging', phase='wire', ok=True):
        result = subprocess.run(['bash', str(ROOT / 'infra/gcp/configure-report-pubsub.sh'), environment, phase],
                                env=self.env, text=True, capture_output=True)
        self.assertEqual(0 if ok else 1, result.returncode, result.stdout + result.stderr)
        return json.loads(self.state.read_text())

    def test_prepare_idempotent_and_never_touches_order_publisher_or_deploys(self):
        self.run_script(phase='prepare')
        state = self.run_script(phase='prepare')
        self.assertEqual(3, len(state['accounts']))
        self.assertFalse(state['subscriptions'])
        creates = [c for c in state['calls'] if c[:3] == ['iam', 'service-accounts', 'create']]
        self.assertEqual(3, len(creates))
        for c in state['calls']:
            self.assertNotEqual(['run', 'deploy'], c[:2])
            self.assertNotIn('serviceAccount:foc-order-service@protean-vigil-509704-q4.iam.gserviceaccount.com', c)
            self.assertNotIn('roles/pubsub.subscriber', c)

    def test_existing_pull_subscriptions_become_authenticated_push_without_recreation(self):
        for environment, suffix in [('staging', 'dev'), ('production', 'prod')]:
            with self.subTest(environment=environment):
                request = f'report-resolution-compensation-{suffix}-v1'
                result = f'report-resolution-compensation-result-{suffix}-v1'
                self.write({'accounts': [], 'topics': [request, result], 'calls': [],
                            'subscriptions': {t + '-sub': {'topic': t} for t in [request, result]}})
                self.run_script(environment)
                state = self.run_script(environment)
                for topic, service, path in [(request, 'reporting-service', '/api/reports/internal/order-resolution-compensations'),
                                              (result, 'order-service', '/api/orders/internal/report-resolution-compensations')]:
                    sub = state['subscriptions'][topic + '-sub']
                    audience = f'https://{service}-{environment}-374055363871.asia-southeast1.run.app'
                    push = sub['push']
                    self.assertEqual(audience + path, push[push.index('--push-endpoint') + 1])
                    self.assertEqual(audience, push[push.index('--push-auth-token-audience') + 1])
                    self.assertIn('--push-auth-service-account', push)
                    self.assertFalse(any(c[:4] == ['pubsub', 'subscriptions', 'create', topic + '-sub'] for c in state['calls']))
                self.assertEqual(3, len(state['subscriptions']))  # Includes retained DLQ recovery.
                self.assertTrue(any('roles/run.invoker' in c for c in state['calls']))
                self.assertTrue(any('roles/iam.serviceAccountTokenCreator' in c for c in state['calls']))
                self.assertTrue(any('--dead-letter-topic' in c for c in state['calls']))

    def test_fresh_subscription_creation_has_same_protections(self):
        state = self.run_script()
        push = state['subscriptions']['report-resolution-compensation-dev-v1-sub']['push']
        self.assertIn('--dead-letter-topic', push)
        self.assertIn('--push-auth-token-audience', push)
        self.assertIn('--push-auth-service-account', push)

    def test_mismatched_binding_and_missing_backend_fail_before_mutation(self):
        for failure in ['wrong-topic', 'missing-backend']:
            with self.subTest(failure=failure):
                state = {'accounts': [], 'topics': [], 'subscriptions': {}, 'calls': []}
                if failure == 'wrong-topic':
                    state['subscriptions']['report-resolution-compensation-dev-v1-sub'] = {'topic': 'unrelated'}
                else:
                    state['missing_service'] = 'reporting-service-staging'
                self.write(state)
                actual = self.run_script(ok=False)
                self.assertTrue(all(c[2] == 'describe' for c in actual['calls']))

    def test_deployment_settings_match_push_contract_and_staged_activation(self):
        for environment, suffix in [('staging', 'dev'), ('production', 'prod')]:
            settings = dict(re.findall(r'^([A-Z_]+)=([^\r\n]*)',
                            (ROOT / f'infra/environments/{environment}.env').read_text(), re.M))
            enabled = 'true' if environment == 'staging' else 'false'
            self.assertEqual(enabled, settings['REPORT_RESOLUTION_ENABLED'])
            self.assertEqual(enabled, settings['ORDER_REPORT_RESOLUTION_ENABLED'])
            self.assertEqual(f'report-resolution-compensation-{suffix}-v1', settings['ORDER_REPORT_COMPENSATION_TOPIC'])
            self.assertEqual(settings['REPORT_COMPENSATION_RESULT_TOPIC'] + '-sub',
                             settings['ORDER_REPORT_COMPENSATION_RESULT_SUBSCRIPTION'])
            for key in ['REPORT_RESOLUTION_PUSH_SERVICE_ACCOUNT', 'ORDER_REPORT_COMPENSATION_PUSH_SERVICE_ACCOUNT']:
                self.assertLessEqual(len(settings[key].split('@')[0]), 30)
        report = (ROOT / 'reporting-service/deploy/env.yaml').read_text()
        order = (ROOT / 'order-service/deploy/env.yaml').read_text()
        self.assertIn('projects/${PROJECT_ID}/subscriptions/${REPORT_RESOLUTION_REQUEST_SUBSCRIPTION}', report)
        self.assertIn('ORDER_SERVICE_TIMEOUT: "20s"', report)
        self.assertIn('REPORT_SERVICE_URL: "${REPORTING_SERVICE_URL}"', order)
        self.assertIn('ORDER_REPORT_COMPENSATION_PUSH_AUDIENCE: "${ORDER_SERVICE_URL}"', order)
        self.assertIn('REPORT_RESOLUTION_PUSH_AUDIENCE: "${REPORTING_SERVICE_URL}"', report)
        self.assertIn('REPORT_RESOLUTION_ENABLED: "${REPORT_RESOLUTION_ENABLED}"', report)
        self.assertIn('ORDER_REPORT_RESOLUTION_ENABLED: "${ORDER_REPORT_RESOLUTION_ENABLED}"', order)


if __name__ == '__main__':
    unittest.main()
