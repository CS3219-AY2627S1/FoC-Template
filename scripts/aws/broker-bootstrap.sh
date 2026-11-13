#!/bin/bash
set -eu
dnf install -y docker
systemctl enable --now docker
install -d -m 700 /opt/campusgo
umask 077
printf 'RABBITMQ_DEFAULT_USER=campusgo\nRABBITMQ_DEFAULT_PASS=' > /opt/campusgo/rabbitmq.env
aws ssm get-parameter --name /campusgo/rabbitmq/password --with-decryption --region ap-southeast-1 --query Parameter.Value --output text >> /opt/campusgo/rabbitmq.env
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin 807733922601.dkr.ecr.ap-southeast-1.amazonaws.com
docker volume create campusgo-rabbitmq
docker run -d --name rabbitmq --hostname campusgo-rabbitmq --restart unless-stopped \
  --env-file /opt/campusgo/rabbitmq.env --log-opt max-size=10m --log-opt max-file=3 \
  -v campusgo-rabbitmq:/var/lib/rabbitmq -p 5672:5672 \
  807733922601.dkr.ecr.ap-southeast-1.amazonaws.com/campusgo/rabbitmq:deploy-20261106
