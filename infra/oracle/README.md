# Oracle VM Deployment

This Terraform stack creates a small Oracle Cloud VM, installs Docker and Nginx with cloud-init, clones this app from Git, writes the runtime environment variables, and runs the app container behind Nginx.

## Cost Shape

Defaults use `VM.Standard.A1.Flex` with `1` OCPU and `6` GB RAM. This is intended to fit inside Oracle Always Free capacity in many regions, but always confirm the shape is marked Always Free in your OCI console before applying.

## Files

- `main.tf` creates the VCN, subnet, firewall rules, and VM.
- `variables.tf` defines OCI credentials and app settings.
- `templates/cloud-init.yaml.tftpl` bootstraps Docker, Nginx, env vars, and the app.
- `terraform.tfvars.example` is the starting point for your real `terraform.tfvars`.

## One-Time Setup

1. Push this project to GitHub.
2. Create or locate your OCI API key and OCIDs.
3. Copy the example vars:

```powershell
Copy-Item infra\oracle\terraform.tfvars.example infra\oracle\terraform.tfvars
```

4. Fill in `terraform.tfvars`.
5. Start with `auth_base_url = "http://PUBLIC_IP"` only after the first apply shows the public IP, or use a DNS name if you already have one pointed at the VM.

## Deploy

```powershell
cd infra\oracle
terraform init
terraform plan
terraform apply
```

After apply, Terraform prints the public IP and SSH command.

## Google OAuth

In Google Cloud Console, add this authorized redirect URI:

```text
https://your-domain.com/auth/google/callback
```

For first HTTP/IP testing, use:

```text
http://PUBLIC_IP/auth/google/callback
```

Then set `AUTH_BASE_URL` in `terraform.tfvars` to the exact same base URL and re-run:

```powershell
terraform apply
```

## HTTPS

For HTTPS:

1. Point your domain A record to the VM public IP.
2. Set:

```hcl
domain_names  = ["your-domain.com"]
auth_base_url = "https://your-domain.com"
enable_https  = true
certbot_email = "you@example.com"
```

3. Run `terraform apply`.

## Updating The App

SSH to the VM and run:

```bash
sudo /usr/local/bin/deploy-propertyscraping
```

This pulls the configured Git branch and rebuilds/restarts the Docker container.

## Data Persistence

The container mounts `/opt/propertyscraping/data` to `/app/data`. The app reads `DATA_DIR=/app/data`, so saved searches, profiles, and subscriptions survive container rebuilds.

## Secret Warning

Terraform variables marked `sensitive` are hidden from CLI output, but values can still be stored in Terraform state. Keep `terraform.tfstate` private and do not commit `terraform.tfvars`.
