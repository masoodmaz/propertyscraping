terraform {
  required_version = ">= 1.6.0"

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
}

provider "oci" {
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
  region           = var.region
}

locals {
  app_name        = "propertyscraping"
  app_dir         = "/opt/propertyscraping"
  app_env_dir     = "/opt/propertyscraping/env"
  app_data_dir    = "/opt/propertyscraping/data"
  app_port        = 3000
  nginx_hostnames = length(var.domain_names) > 0 ? join(" ", var.domain_names) : "_"
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = var.ubuntu_version
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_vcn" "main" {
  compartment_id = var.compartment_ocid
  cidr_block     = "10.0.0.0/16"
  display_name   = "${local.app_name}-vcn"
  dns_label      = "propscrape"
}

resource "oci_core_internet_gateway" "main" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${local.app_name}-igw"
  enabled        = true
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${local.app_name}-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.main.id
  }
}

resource "oci_core_security_list" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "${local.app_name}-public-sl"

  ingress_security_rules {
    protocol = "6"
    source   = var.ssh_allowed_cidr

    tcp_options {
      min = 22
      max = 22
    }
  }

  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"

    tcp_options {
      min = 80
      max = 80
    }
  }

  ingress_security_rules {
    protocol = "6"
    source   = "0.0.0.0/0"

    tcp_options {
      min = 443
      max = 443
    }
  }

  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
  }
}

resource "oci_core_subnet" "public" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.main.id
  cidr_block                 = "10.0.1.0/24"
  display_name               = "${local.app_name}-public-subnet"
  dns_label                  = "public"
  route_table_id             = oci_core_route_table.public.id
  security_list_ids          = [oci_core_security_list.public.id]
  prohibit_public_ip_on_vnic = false
}

resource "oci_core_instance" "app" {
  availability_domain = coalesce(var.availability_domain, data.oci_identity_availability_domains.ads.availability_domains[0].name)
  compartment_id      = var.compartment_ocid
  display_name        = "${local.app_name}-vm"
  shape               = var.instance_shape

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_gb
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
    display_name     = "${local.app_name}-vnic"
    hostname_label   = "propertyapp"
  }

  source_details {
    source_type = "image"
    source_id   = data.oci_core_images.ubuntu.images[0].id
  }

  metadata = {
    ssh_authorized_keys = file(pathexpand(var.ssh_public_key_path))
    user_data = base64encode(templatefile("${path.module}/templates/cloud-init.yaml.tftpl", {
      app_name             = local.app_name
      app_dir              = local.app_dir
      app_env_dir          = local.app_env_dir
      app_data_dir         = local.app_data_dir
      app_port             = local.app_port
      app_repo_url         = var.app_repo_url
      app_repo_branch      = var.app_repo_branch
      auth_base_url        = var.auth_base_url
      auth_allowed_emails  = var.auth_allowed_emails
      google_client_id     = var.google_client_id
      google_client_secret = var.google_client_secret
      telegram_bot_api     = var.telegram_bot_api
      nginx_hostnames      = local.nginx_hostnames
      certbot_email        = var.certbot_email
      enable_https         = var.enable_https
    }))
  }
}
