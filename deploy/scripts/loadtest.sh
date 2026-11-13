#!/usr/bin/env bash
# Evidence for the autoscaling (N6.3). Runs k6 as a Job inside the cloud cluster, so the laptop
# only watches: every 15 seconds it writes down the load and the instance count of each scaled
# service, and at the end the scaling events, when each user-service instance became ready, and
# k6's summary. Takes about 13 minutes: 6 under load, then up to 7 until the extra instances are gone.
#
#   deploy/scripts/loadtest.sh                  20 virtual users for 5 minutes
#   VUS=40 HOLD=8m deploy/scripts/loadtest.sh
#
# Writes docs/evidence/autoscaling-<date>.txt
set -euo pipefail

cd "$(dirname "$0")/../.."
export KUBECONFIG="${RELAY_KUBECONFIG:-$HOME/.kube/relay-aws.yaml}"

NS=relay
VUS="${VUS:-20}"
HOLD="${HOLD:-5m}"
# How long to keep watching after the load ends: scaling in waits 5 minutes on purpose.
AFTER_SECONDS="${AFTER_SECONDS:-420}"
mkdir -p docs/evidence
out="docs/evidence/autoscaling-$(date +%Y-%m-%d-%H%M).txt"

kubectl -n "$NS" create configmap loadtest --from-file=deploy/loadtest/load.js \
  --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n "$NS" delete job loadtest --ignore-not-found --wait >/dev/null

kubectl apply -f - >/dev/null <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: loadtest
  namespace: $NS
spec:
  backoffLimit: 0
  ttlSecondsAfterFinished: 3600
  template:
    metadata:
      # The network rules let only pods with this label reach the gateway from inside.
      labels:
        app.kubernetes.io/name: loadtest
    spec:
      restartPolicy: Never
      containers:
        - name: k6
          image: grafana/k6:2.3.0
          args: ["run", "--quiet", "/scripts/load.js"]
          env:
            - name: BASE_URL
              value: http://web-client.$NS.svc.cluster.local:8080
            - name: VUS
              value: "$VUS"
            - name: HOLD
              value: "$HOLD"
            - name: ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: relay-secrets
                  key: ADMIN_PASSWORD
          volumeMounts:
            - name: scripts
              mountPath: /scripts
          resources:
            requests:
              cpu: 250m
              memory: 128Mi
            limits:
              cpu: "1"
              memory: 512Mi
      volumes:
        - name: scripts
          configMap:
            name: loadtest
EOF

snapshot() {
  echo "== $(date -u +%H:%M:%S) UTC"
  kubectl -n "$NS" get hpa --no-headers -o custom-columns='SERVICE:.metadata.name,CPU_PERCENT_OF_REQUEST:.status.currentMetrics[0].resource.current.averageUtilization,TARGET:.spec.metrics[0].resource.target.averageUtilization,INSTANCES:.status.currentReplicas,WANTED:.status.desiredReplicas'
}

{
  echo "Autoscaling evidence for N6.3, $(date -u '+%Y-%m-%d %H:%M') UTC"
  echo "k6: $VUS virtual users for $HOLD, requests for the own profile through the gateway"
  echo "Rule: target 70 % of the CPU request, scale out after 120 s above it, scale in after 300 s below"
  echo
  until kubectl -n "$NS" get job loadtest -o jsonpath='{.status.conditions[*].type}' | grep -qE 'Complete|Failed'; do
    snapshot
    sleep 15
  done
  echo "-- load finished $(date -u +%H:%M:%S) UTC"
  # Now, before the extra instances are removed again.
  echo
  echo "== Instances of the scaled services: created and ready"
  kubectl -n "$NS" get pods -l 'app.kubernetes.io/name in (user-service,web-client,supplier-service,credit-service)' \
    -o custom-columns='POD:.metadata.name,CREATED:.metadata.creationTimestamp,READY_SINCE:.status.conditions[?(@.type=="Ready")].lastTransitionTime'
  echo
  echo "-- watching the scale-in"
  end=$((SECONDS + AFTER_SECONDS))
  while [ "$SECONDS" -lt "$end" ]; do
    snapshot
    sleep 30
  done
  echo
  echo "== Scaling events"
  kubectl -n "$NS" get events --field-selector involvedObject.kind=HorizontalPodAutoscaler \
    --sort-by=.lastTimestamp -o custom-columns='TIME:.lastTimestamp,SERVICE:.involvedObject.name,MESSAGE:.message'
  echo
  echo "== user-service containers started and stopped"
  kubectl -n "$NS" get events --field-selector involvedObject.kind=Pod --sort-by=.lastTimestamp \
    -o custom-columns='TIME:.lastTimestamp,POD:.involvedObject.name,REASON:.reason' \
    | grep -E '^TIME|user-service.*(Started|Killing)'
  echo
  echo "== k6 summary"
  kubectl -n "$NS" logs job/loadtest
} 2>&1 | tee "$out"

echo
echo "Saved to $out"
