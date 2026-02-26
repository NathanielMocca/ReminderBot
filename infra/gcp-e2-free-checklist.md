# GCP e2-micro Free Checklist

## VM Provisioning

- Region: `us-west1` or `us-central1` or `us-east1` (Always Free eligible)
- Machine type: `e2-micro`
- Disk type: standard persistent disk
- Disk size: keep total under free allowance target

## Runtime

- Install Node.js 20+
- Install PM2
- Start two apps with memory guard:
  - bot: `--max-memory-restart 250M`
  - server: `--max-memory-restart 250M`

## Network and Cost Guard

- Keep outbound traffic low (avoid large attachments in reminder messages)
- Set billing budget alert even if aiming for zero-cost operation
- Monitor Compute Engine and Firestore usage weekly

## Service Resilience

- Enable PM2 startup on reboot
- Use health endpoint `/healthz` for monitoring
- Keep environment secrets outside code repository
