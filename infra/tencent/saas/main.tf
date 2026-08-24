data "tencentcloud_user_info" "current" {}

locals {
  name = "jingtang-${var.stage}"
  tags = merge(var.tags, {
    environment = var.stage
    region      = var.region
  })
  app_id    = data.tencentcloud_user_info.current.app_id
  owner_uin = data.tencentcloud_user_info.current.owner_uin
}

resource "tencentcloud_vpc" "saas" {
  name       = "${local.name}-vpc"
  cidr_block = var.vpc_cidr
  tags       = local.tags
}

resource "tencentcloud_subnet" "application" {
  name              = "${local.name}-application"
  vpc_id            = tencentcloud_vpc.saas.id
  availability_zone = var.availability_zone
  cidr_block        = var.application_subnet_cidr
  is_multicast      = false
  tags              = local.tags
}

resource "tencentcloud_subnet" "data" {
  name              = "${local.name}-data"
  vpc_id            = tencentcloud_vpc.saas.id
  availability_zone = var.availability_zone
  cidr_block        = var.data_subnet_cidr
  is_multicast      = false
  tags              = local.tags
}

resource "tencentcloud_security_group" "application" {
  name        = "${local.name}-application"
  description = "Public TLS and explicitly allow-listed production administration only."
  tags        = local.tags
}

resource "tencentcloud_security_group_rule_set" "application" {
  security_group_id = tencentcloud_security_group.application.id

  ingress {
    action      = "ACCEPT"
    cidr_block  = "0.0.0.0/0"
    protocol    = "TCP"
    port        = "80"
    description = "Public HTTP redirect and ACME challenge"
  }

  ingress {
    action      = "ACCEPT"
    cidr_block  = "0.0.0.0/0"
    protocol    = "TCP"
    port        = "443"
    description = "Public SaaS TLS"
  }

  dynamic "ingress" {
    for_each = toset(var.administrator_cidrs)
    content {
      action      = "ACCEPT"
      cidr_block  = ingress.value
      protocol    = "TCP"
      port        = "22"
      description = "Dedicated production SSH administration"
    }
  }

  egress {
    action      = "ACCEPT"
    cidr_block  = "0.0.0.0/0"
    protocol    = "ALL"
    port        = "ALL"
    description = "TLS provider and Tencent managed-service access"
  }
}

resource "tencentcloud_security_group" "database" {
  name        = "${local.name}-database"
  description = "TencentDB accepts PostgreSQL only from the application subnet."
  tags        = local.tags
}

resource "tencentcloud_security_group_rule_set" "database" {
  security_group_id = tencentcloud_security_group.database.id

  ingress {
    action      = "ACCEPT"
    cidr_block  = var.application_subnet_cidr
    protocol    = "TCP"
    port        = "5432"
    description = "Application and separately credentialed worker roles"
  }

  egress {
    action      = "ACCEPT"
    cidr_block  = var.vpc_cidr
    protocol    = "ALL"
    port        = "ALL"
    description = "VPC response traffic"
  }
}

resource "tencentcloud_kms_key" "application" {
  alias                         = replace("${local.name}-application", "-", "_")
  description                   = "JINGTANG ${var.stage} application and COS encryption"
  key_rotation_enabled          = true
  is_enabled                    = true
  pending_delete_window_in_days = 30
  tags                          = local.tags
}

resource "tencentcloud_kms_key" "oauth" {
  alias                         = replace("${local.name}-oauth-token-envelope", "-", "_")
  description                   = "JINGTANG ${var.stage} per-connection OAuth data-key wrapping"
  key_rotation_enabled          = true
  is_enabled                    = true
  pending_delete_window_in_days = 30
  tags                          = local.tags
}

resource "tencentcloud_kms_key" "secrets" {
  alias                         = replace("${local.name}-runtime-secrets", "-", "_")
  description                   = "JINGTANG ${var.stage} runtime secret-bundle wrapping"
  key_rotation_enabled          = true
  is_enabled                    = true
  pending_delete_window_in_days = 30
  tags                          = local.tags
}

resource "tencentcloud_cos_bucket" "source_assets" {
  bucket               = "${local.name}-source-assets-${local.app_id}"
  acl                  = "private"
  encryption_algorithm = "KMS"
  kms_id               = tencentcloud_kms_key.application.id
  versioning_enable    = true
  force_clean          = false

  lifecycle_rules {
    id            = "residual-version-retention"
    filter_prefix = ""

    non_current_expiration {
      non_current_days = 35
    }

    expiration {
      delete_marker = true
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "tencentcloud_cos_bucket" "oauth_wrapped_keys" {
  bucket               = "${local.name}-oauth-wrapped-keys-${local.app_id}"
  acl                  = "private"
  encryption_algorithm = "KMS"
  kms_id               = tencentcloud_kms_key.oauth.id
  versioning_enable    = true
  force_clean          = false

  lifecycle_rules {
    id            = "residual-version-retention"
    filter_prefix = ""

    non_current_expiration {
      non_current_days = 35
    }

    expiration {
      delete_marker = true
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "tencentcloud_cos_bucket" "runtime_secrets" {
  bucket               = "${local.name}-runtime-secrets-${local.app_id}"
  acl                  = "private"
  encryption_algorithm = "KMS"
  kms_id               = tencentcloud_kms_key.secrets.id
  versioning_enable    = true
  force_clean          = false

  lifecycle_rules {
    id            = "residual-version-retention"
    filter_prefix = ""

    non_current_expiration {
      non_current_days = 35
    }

    expiration {
      delete_marker = true
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "tencentcloud_cam_role" "application" {
  name = "${local.name}-cvm-runtime"
  document = jsonencode({
    version = "2.0"
    statement = [{
      action = ["name/sts:AssumeRole"]
      effect = "allow"
      principal = {
        service = ["cvm.qcloud.com"]
      }
    }]
  })
  description      = "Temporary least-privilege credentials for the JINGTANG runtime"
  console_login    = false
  session_duration = 7200
  tags             = local.tags
}

resource "tencentcloud_cam_policy" "application" {
  name = "${local.name}-runtime-data-plane"
  document = jsonencode({
    version = "2.0"
    statement = [
      {
        effect = "allow"
        action = [
          "name/cos:GetObject",
          "name/cos:HeadObject",
          "name/cos:PutObject",
          "name/cos:DeleteObject",
        ]
        resource = [
          "qcs::cos:${var.region}:uid/${local.app_id}:${tencentcloud_cos_bucket.source_assets.bucket}/*",
          "qcs::cos:${var.region}:uid/${local.app_id}:${tencentcloud_cos_bucket.oauth_wrapped_keys.bucket}/*",
        ]
      },
      {
        effect = "allow"
        action = [
          "name/kms:GenerateDataKey",
          "name/kms:Decrypt",
        ]
        resource = [
          "qcs::kms:${var.region}:uin/${local.owner_uin}:key/creatorUin/${local.owner_uin}/${tencentcloud_kms_key.oauth.id}",
        ]
      },
      {
        effect = "allow"
        action = [
          "name/cos:GetObject",
          "name/cos:HeadObject",
        ]
        resource = [
          "qcs::cos:${var.region}:uid/${local.app_id}:${tencentcloud_cos_bucket.runtime_secrets.bucket}/platform/runtime.enc",
          "qcs::cos:${var.region}:uid/${local.app_id}:${tencentcloud_cos_bucket.runtime_secrets.bucket}/dispatcher/runtime.enc",
          "qcs::cos:${var.region}:uid/${local.app_id}:${tencentcloud_cos_bucket.runtime_secrets.bucket}/worker/runtime.enc",
        ]
      },
      {
        effect = "allow"
        action = [
          "name/kms:Decrypt",
        ]
        resource = [
          "qcs::kms:${var.region}:uin/${local.owner_uin}:key/creatorUin/${local.owner_uin}/${tencentcloud_kms_key.secrets.id}",
        ]
      },
      {
        effect = "allow"
        action = [
          "name/ciam:DeleteUsers",
        ]
        resource = ["*"]
      },
    ]
  })
  description = "Only the COS objects and OAuth KMS operations required by the SaaS runtime"
  tags        = local.tags
}

resource "tencentcloud_cam_role_policy_attachment" "application" {
  role_id   = tencentcloud_cam_role.application.id
  policy_id = tencentcloud_cam_policy.application.id
}

resource "tencentcloud_instance" "application" {
  instance_name              = "${local.name}-application"
  availability_zone          = var.availability_zone
  image_id                   = var.cvm_image_id
  instance_type              = var.cvm_instance_type
  system_disk_type           = "CLOUD_SSD"
  system_disk_size           = 80
  system_disk_encrypt        = true
  system_disk_kms_key_id     = tencentcloud_kms_key.application.id
  hostname                   = replace("${local.name}-app", "_", "-")
  vpc_id                     = tencentcloud_vpc.saas.id
  subnet_id                  = tencentcloud_subnet.application.id
  orderly_security_groups    = [tencentcloud_security_group.application.id]
  key_ids                    = var.cvm_key_ids
  cam_role_name              = tencentcloud_cam_role.application.name
  allocate_public_ip         = true
  internet_max_bandwidth_out = 20
  instance_charge_type       = "POSTPAID_BY_HOUR"
  tags                       = local.tags
}

resource "tencentcloud_postgresql_instance" "application" {
  name                 = "${local.name}-postgresql"
  availability_zone    = var.availability_zone
  charge_type          = "POSTPAID_BY_HOUR"
  vpc_id               = tencentcloud_vpc.saas.id
  subnet_id            = tencentcloud_subnet.data.id
  db_major_version     = var.postgres_major_version
  engine_version       = var.postgres_engine_version
  root_user            = "jingtang_bootstrap"
  root_password        = var.postgres_root_password
  charset              = "UTF8"
  cpu                  = 2
  memory               = 4
  storage              = 100
  public_access_switch = false
  security_groups      = [tencentcloud_security_group.database.id]
  delete_protection    = true

  db_node_set {
    role = "Primary"
    zone = var.availability_zone
  }

  db_node_set {
    zone = var.standby_availability_zone
  }

  tags = local.tags

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [root_password]
  }
}

resource "tencentcloud_postgresql_instance_ssl_config" "application" {
  db_instance_id  = tencentcloud_postgresql_instance.application.id
  ssl_enabled     = true
  connect_address = tencentcloud_postgresql_instance.application.private_access_ip
}

resource "tencentcloud_postgresql_backup_plan" "application" {
  db_instance_id               = tencentcloud_postgresql_instance.application.id
  plan_name                    = "${local.name}-daily"
  backup_period_type           = "week"
  backup_period                = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
  min_backup_start_time        = "18:00:00"
  max_backup_start_time        = "20:00:00"
  base_backup_retention_period = 35
  log_backup_retention_period  = 35
  backup_method                = "physical"
}

resource "tencentcloud_tdmq_rabbitmq_vip_instance" "commands" {
  zone_ids                              = var.tdmq_zone_ids
  vpc_id                                = tencentcloud_vpc.saas.id
  subnet_id                             = tencentcloud_subnet.data.id
  cluster_name                          = "${local.name}-commands"
  node_spec                             = "rabbit-vip-basic-1"
  node_num                              = 3
  storage_size                          = 200
  enable_create_default_ha_mirror_queue = true
  auto_renew_flag                       = false
  pay_mode                              = 0
  cluster_version                       = "3.13.7"
  enable_public_access                  = false

  resource_tags {
    tag_key   = "environment"
    tag_value = var.stage
  }
}

resource "tencentcloud_tdmq_rabbitmq_virtual_host" "commands" {
  instance_id  = tencentcloud_tdmq_rabbitmq_vip_instance.commands.id
  virtual_host = "jingtang-${var.stage}"
  description  = "Isolated JINGTANG ${var.stage} dispatcher and worker commands"
  trace_flag   = true
}

resource "tencentcloud_tdmq_rabbitmq_user" "application" {
  instance_id     = tencentcloud_tdmq_rabbitmq_vip_instance.commands.id
  user            = "jingtang_${var.stage}"
  password        = var.tdmq_bootstrap_password
  description     = "Bootstrap identity; rotate into the protected KMS-sealed COS bundle after apply"
  max_connections = 20
  max_channels    = 100

  lifecycle {
    ignore_changes = [password]
  }
}

resource "tencentcloud_tdmq_rabbitmq_user_permission" "application" {
  instance_id   = tencentcloud_tdmq_rabbitmq_vip_instance.commands.id
  user          = tencentcloud_tdmq_rabbitmq_user.application.user
  virtual_host  = tencentcloud_tdmq_rabbitmq_virtual_host.commands.virtual_host
  config_regexp = "^jingtang\\..*"
  write_regexp  = "^jingtang\\..*"
  read_regexp   = "^jingtang\\..*"
}

resource "tencentcloud_cls_logset" "application" {
  logset_name = "${local.name}-application"
  tags        = local.tags
}

resource "tencentcloud_cls_topic" "application" {
  topic_name           = "${local.name}-application"
  logset_id            = tencentcloud_cls_logset.application.id
  auto_split           = true
  max_split_partitions = 20
  partition_count      = 1
  period               = 30
  storage_type         = "hot"
  encryption           = 1
  describes            = "Redacted application, dispatcher and worker logs"
  tags                 = local.tags
}

resource "tencentcloud_cls_topic" "security" {
  topic_name           = "${local.name}-security"
  logset_id            = tencentcloud_cls_logset.application.id
  auto_split           = true
  max_split_partitions = 20
  partition_count      = 1
  period               = 365
  storage_type         = "hot"
  encryption           = 1
  describes            = "Restricted production security and access evidence"
  tags                 = local.tags
}
