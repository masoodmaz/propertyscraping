variable "tenancy_ocid" {
  description = "Oracle Cloud tenancy OCID."
  type        = string
}

variable "user_ocid" {
  description = "Oracle Cloud user OCID for Terraform API access."
  type        = string
}

variable "fingerprint" {
  description = "Fingerprint for the OCI API signing key."
  type        = string
}

variable "private_key_path" {
  description = "Local path to the OCI API private key."
  type        = string
}

variable "region" {
  description = "OCI region, for example uk-london-1."
  type        = string
  default     = "uk-london-1"
}

variable "compartment_ocid" {
  description = "Compartment OCID where resources will be created."
  type        = string
}

variable "availability_domain" {
  description = "Optional availability domain name. Leave null to use the first AD."
  type        = string
  default     = null
}

variable "ssh_public_key_path" {
  description = "Local path to the SSH public key for VM login."
  type        = string
  default     = "~/.ssh/id_rsa.pub"
}

variable "ssh_allowed_cidr" {
  description = "CIDR allowed to SSH to the VM. Use your own IP /32 for better security."
  type        = string
  default     = "0.0.0.0/0"
}

variable "ubuntu_version" {
  description = "Ubuntu image version to use."
  type        = string
  default     = "22.04"
}

variable "instance_shape" {
  description = "Always Free eligible ARM shape in many OCI regions."
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "instance_ocpus" {
  description = "OCPUs for the VM. Keep within Always Free account limits."
  type        = number
  default     = 1
}

variable "instance_memory_gb" {
  description = "Memory for the VM. Keep within Always Free account limits."
  type        = number
  default     = 6
}

variable "app_repo_url" {
  description = "Git repository URL for this app."
  type        = string
}

variable "app_repo_branch" {
  description = "Git branch to deploy."
  type        = string
  default     = "main"
}

variable "auth_base_url" {
  description = "Public base URL, for example https://property.example.com or http://VM_IP while testing."
  type        = string
}

variable "auth_allowed_emails" {
  description = "Comma-separated list of Google emails allowed into the app."
  type        = string
}

variable "google_client_id" {
  description = "Google OAuth client ID."
  type        = string
  sensitive   = true
}

variable "google_client_secret" {
  description = "Google OAuth client secret."
  type        = string
  sensitive   = true
}

variable "telegram_bot_api" {
  description = "Telegram bot token. Leave default for mock mode."
  type        = string
  sensitive   = true
  default     = "YOUR_TELEGRAM_BOT_TOKEN"
}

variable "domain_names" {
  description = "Domain names for Nginx. Leave empty to serve by public IP over HTTP."
  type        = list(string)
  default     = []
}

variable "enable_https" {
  description = "Run certbot for domain_names. Requires DNS already pointed to the VM."
  type        = bool
  default     = false
}

variable "certbot_email" {
  description = "Email for Let's Encrypt certificate registration when enable_https is true."
  type        = string
  default     = ""
}
