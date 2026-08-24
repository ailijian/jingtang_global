output "application_public_ip" {
  value = tencentcloud_instance.application.public_ip
}

output "postgresql_private_endpoint" {
  value     = "${tencentcloud_postgresql_instance.application.private_access_ip}:${tencentcloud_postgresql_instance.application.private_access_port}"
  sensitive = true
}

output "source_asset_bucket" {
  value = tencentcloud_cos_bucket.source_assets.bucket
}

output "oauth_wrapped_key_bucket" {
  value = tencentcloud_cos_bucket.oauth_wrapped_keys.bucket
}

output "oauth_kms_key_id" {
  value = tencentcloud_kms_key.oauth.id
}

output "tdmq_instance_id" {
  value = tencentcloud_tdmq_rabbitmq_vip_instance.commands.id
}

output "runtime_secret_bucket" {
  value = tencentcloud_cos_bucket.runtime_secrets.bucket
}

output "runtime_secret_kms_key_id" {
  value = tencentcloud_kms_key.secrets.id
}

output "application_log_topic_id" {
  value = tencentcloud_cls_topic.application.id
}

output "security_log_topic_id" {
  value = tencentcloud_cls_topic.security.id
}
