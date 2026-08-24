variable "stage" {
  description = "Isolated deployment namespace. D7 production uses production."
  type        = string
  default     = "production"

  validation {
    condition     = contains(["integration", "production"], var.stage)
    error_message = "stage must be integration or production"
  }
}

variable "region" {
  description = "Tencent Cloud region required by the approved architecture."
  type        = string
  default     = "ap-seoul"

  validation {
    condition     = var.region == "ap-seoul"
    error_message = "The SaaS data plane is frozen to ap-seoul."
  }
}

variable "availability_zone" {
  description = "Primary Seoul availability zone selected after a current capacity check."
  type        = string

  validation {
    condition     = contains(["ap-seoul-1", "ap-seoul-2"], var.availability_zone)
    error_message = "availability_zone must be a current Seoul zone."
  }
}

variable "standby_availability_zone" {
  description = "Separate Seoul zone for the PostgreSQL standby node."
  type        = string

  validation {
    condition = (
      contains(["ap-seoul-1", "ap-seoul-2"], var.standby_availability_zone) &&
      var.standby_availability_zone != var.availability_zone
    )
    error_message = "standby_availability_zone must be the other current Seoul zone."
  }
}

variable "tdmq_zone_ids" {
  description = "Current numeric TDMQ RabbitMQ zone IDs returned for ap-seoul by the operator's account."
  type        = list(number)

  validation {
    condition     = length(var.tdmq_zone_ids) > 0 && alltrue([for id in var.tdmq_zone_ids : id > 0])
    error_message = "tdmq_zone_ids must contain current positive ap-seoul zone IDs queried before plan/apply."
  }
}

variable "vpc_cidr" {
  type    = string
  default = "10.72.0.0/16"
}

variable "application_subnet_cidr" {
  type    = string
  default = "10.72.10.0/24"
}

variable "data_subnet_cidr" {
  type    = string
  default = "10.72.20.0/24"
}

variable "administrator_cidrs" {
  description = "Human-controlled source networks allowed to use SSH. Never use 0.0.0.0/0."
  type        = list(string)
  default     = []
}

variable "cvm_image_id" {
  description = "Approved, patched Seoul image ID."
  type        = string
}

variable "cvm_instance_type" {
  description = "Currently available Seoul CVM instance type."
  type        = string
}

variable "cvm_key_ids" {
  description = "Dedicated production SSH public key IDs."
  type        = list(string)
}

variable "postgres_major_version" {
  type    = string
  default = "16"
}

variable "postgres_engine_version" {
  description = "Currently offered TencentDB PostgreSQL engine version for the selected zones."
  type        = string
}

variable "postgres_root_password" {
  description = "One-use bootstrap value. Rotate into the protected KMS-sealed COS secret bundle immediately after apply."
  type        = string
  sensitive   = true
}

variable "tdmq_bootstrap_password" {
  description = "One-use bootstrap value. Rotate into the protected KMS-sealed COS secret bundle immediately after apply."
  type        = string
  sensitive   = true
}

variable "tags" {
  type = map(string)
  default = {
    managed_by = "terraform"
    system     = "jingtang-saas"
  }
}
