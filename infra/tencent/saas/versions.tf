terraform {
  required_version = "~> 1.13.0"

  required_providers {
    tencentcloud = {
      source  = "tencentcloudstack/tencentcloud"
      version = "~> 1.83.0"
    }
  }

  backend "cos" {
    encrypt = true
    acl     = "private"
  }
}

provider "tencentcloud" {
  region = var.region
}
