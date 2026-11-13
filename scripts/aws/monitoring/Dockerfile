FROM grafana/grafana:13.3.0 AS grafana
USER root
COPY observability/grafana/provisioning /etc/grafana/provisioning
COPY observability/grafana/dashboards /etc/campusgo/dashboards
RUN sed -i 's@http://prometheus:9090@http://127.0.0.1:9090@g' /etc/grafana/provisioning/datasources/prometheus.yaml && sed -i 's@http://tempo:3200@http://127.0.0.1:3200@g' /etc/grafana/provisioning/datasources/tempo.yaml && sed -i 's@/var/lib/grafana/dashboards@/etc/campusgo/dashboards@g' /etc/grafana/provisioning/dashboards/campusgo.yaml
USER 472
FROM grafana/tempo:3.1.1 AS tempo
COPY scripts/aws/monitoring/tempo.yaml /etc/tempo/config.yaml
FROM otel/opentelemetry-collector:0.163.0-nightly.ea6d627 AS collector
COPY scripts/aws/monitoring/otel-collector.yaml /etc/otelcol/config.yaml
FROM prom/prometheus:v3.15.1 AS prometheus
COPY scripts/aws/monitoring/prometheus.yaml /etc/prometheus/prometheus.template.yaml
COPY scripts/aws/monitoring/prometheus-start.sh /campusgo-start.sh
ENTRYPOINT ["/bin/sh", "/campusgo-start.sh"]
