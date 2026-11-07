{{/* Scripts from k6/ and setup/, laid out as in the repo so load.js finds ../data. */}}
{{- define "load-test.scriptVolumes" -}}
- name: k6
  configMap:
    name: load-test-scripts
    items: [{ key: load.js, path: load.js }]
- name: setup
  configMap:
    name: load-test-scripts
    items:
      - { key: roster.mjs, path: roster.mjs }
      - { key: seed-users.mjs, path: seed-users.mjs }
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
    requests: { cpu: 200m, memory: 256Mi }
    limits: { cpu: "1", memory: 512Mi }
  volumeMounts:
    - { name: setup, mountPath: /work/setup }
    - { name: data, mountPath: /work/data }
{{- end }}
