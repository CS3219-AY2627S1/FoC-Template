{{/* Scripts from k6/ and setup/, laid out as in the repo so they find ../data. */}}
{{- define "load-test.scriptVolumes" -}}
- name: scripts
  configMap:
    name: load-test-scripts
- name: data
  emptyDir: {}
{{- end }}

{{/* Writes users.json, users.sql and credits.sql to /work/data. Ids are deterministic. */}}
{{- define "load-test.seedContainer" -}}
- name: seed
  image: {{ .Values.images.node }}
  command: [node, /work/setup/seed-users.mjs]
  env:
    - { name: VUS, value: {{ .Values.seedVus | quote }} }
  resources:
    # Low requests so seed still schedules when Order is pinned at 32 (cluster
    # often has Insufficient cpu for 500m+). Limits stay high for the 60k burst.
    requests: { cpu: 100m, memory: 256Mi }
    limits: { cpu: "1", memory: 2Gi }
  # subPath: plain files. A directory mount is symlinks into ..<timestamp>/,
  # which Node resolves, so the script would look for ../data in the wrong place.
  volumeMounts:
    - { name: scripts, mountPath: /work/setup/roster.mjs, subPath: roster.mjs }
    - { name: scripts, mountPath: /work/setup/seed-users.mjs, subPath: seed-users.mjs }
    - { name: data, mountPath: /work/data }
{{- end }}
