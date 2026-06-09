output "public_ip" {
  description = "Public IP address of the VM."
  value       = oci_core_instance.app.public_ip
}

output "ssh_command" {
  description = "SSH command for the VM."
  value       = "ssh ubuntu@${oci_core_instance.app.public_ip}"
}

output "app_url" {
  description = "HTTP URL for first access. Use your auth_base_url once DNS/HTTPS is configured."
  value       = "http://${oci_core_instance.app.public_ip}"
}
