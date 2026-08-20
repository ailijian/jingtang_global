import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_cognito as cognito,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_rds as rds,
  aws_sqs as sqs,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

interface PlatformFoundationStackProps extends StackProps {
  readonly stage: "staging" | "production";
}

export class PlatformFoundationStack extends Stack {
  public constructor(scope: Construct, id: string, props: PlatformFoundationStackProps) {
    super(scope, id, props);

    const production = props.stage === "production";
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "application", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: production ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    const client = userPool.addClient("PlatformClient", {
      authFlows: { userPassword: true },
      disableOAuth: true,
      preventUserExistenceErrors: true,
      generateSecret: false,
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(30),
    });

    const databaseSecurityGroup = new ec2.SecurityGroup(this, "DatabaseSecurityGroup", {
      vpc,
      allowAllOutbound: false,
      description: "Database accepts traffic only from explicitly authorized application services.",
    });
    const database = new rds.DatabaseInstance(this, "Database", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [databaseSecurityGroup],
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17_4,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
      multiAz: true,
      storageEncrypted: true,
      allocatedStorage: 100,
      maxAllocatedStorage: 500,
      backupRetention: Duration.days(35),
      deletionProtection: production,
      removalPolicy: production ? RemovalPolicy.RETAIN : RemovalPolicy.SNAPSHOT,
      publiclyAccessible: false,
      databaseName: "jingtang",
    });

    new ecs.Cluster(this, "Cluster", {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const deadLetterQueue = new sqs.Queue(this, "DeadLetterQueue", {
      encryption: sqs.QueueEncryption.KMS_MANAGED,
      retentionPeriod: Duration.days(14),
    });
    new sqs.Queue(this, "WorkQueue", {
      encryption: sqs.QueueEncryption.KMS_MANAGED,
      visibilityTimeout: Duration.minutes(15),
      retentionPeriod: Duration.days(1),
      deadLetterQueue: { queue: deadLetterQueue, maxReceiveCount: 5 },
    });

    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: client.userPoolClientId });
    new CfnOutput(this, "DatabaseSecretArn", {
      value: database.secret?.secretArn ?? "not-created",
    });
  }
}
