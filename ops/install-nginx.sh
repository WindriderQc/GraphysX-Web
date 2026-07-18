#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this installer with sudo." >&2
  exit 1
fi

host=graphysx.specialblend.ca
expected_ip=103.54.59.80
actual_ip=$(getent ahostsv4 "$host" | awk 'NR == 1 { print $1 }')

if [[ "$actual_ip" != "$expected_ip" ]]; then
  echo "$host resolves to ${actual_ip:-nothing}; expected $expected_ip." >&2
  exit 1
fi

install -m 0644 /home/yb/graphysx.specialblend.ca /etc/nginx/sites-available/graphysx.specialblend.ca
ln -sfn /etc/nginx/sites-available/graphysx.specialblend.ca /etc/nginx/sites-enabled/graphysx.specialblend.ca
nginx -t
systemctl reload nginx
certbot --nginx --redirect -d "$host"
nginx -t
systemctl reload nginx

echo "GraphysX nginx and TLS are active at https://$host/"
