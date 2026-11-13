# Generate a reviewable CloudFormation template; no account mutations or secrets.
$resources = [ordered]@{}
function Ref($name) { @{ Ref=$name } }
function Attr($name,$key) { @{ 'Fn::GetAtt'=@($name,$key) } }
function Resource($name,$type,$properties,$why,$must=@()) {
    $resources[$name] = @{ Type=$type; Properties=$properties; Metadata=@{'com.aws.cloudformation.Context'=@{why=$why;must=$must}} }
}
Resource Namespace AWS::ServiceDiscovery::PrivateDnsNamespace @{Name='campusgo.local';Vpc=(Ref Vpc)} 'Stable private service addresses across task replacements'
foreach ($name in @('user','supplier','order','credit','api-gateway','frontend')) {
    $id = ($name -replace '-','') + 'Discovery'
    Resource $id AWS::ServiceDiscovery::Service @{Name=$name;DnsConfig=@{NamespaceId=(Ref Namespace);DnsRecords=@(@{Type='A';TTL=10});RoutingPolicy='MULTIVALUE'};HealthCheckCustomConfig=@{FailureThreshold=1}} 'ECS maintains task IP records'
}
Resource InternalSecurityGroup AWS::EC2::SecurityGroup @{GroupDescription='CampusGo internal application traffic';VpcId=(Ref Vpc)} 'Restrict application listeners to project callers'
foreach ($port in @(80,3000)) {
    Resource "Internal$port" AWS::EC2::SecurityGroupIngress @{GroupId=(Ref InternalSecurityGroup);IpProtocol='tcp';FromPort=$port;ToPort=$port;SourceSecurityGroupId=(Ref InternalSecurityGroup)} 'Application communication within the shared group'
}
Resource BrokerSecurityGroup AWS::EC2::SecurityGroup @{GroupDescription='CampusGo broker clients';VpcId=(Ref Vpc);SecurityGroupIngress=@(@{IpProtocol='tcp';FromPort=5672;ToPort=5672;SourceSecurityGroupId=(Ref InternalSecurityGroup)})} 'RabbitMQ is reachable only from application tasks' @('Never expose AMQP or management UI publicly')
Resource InstanceRole AWS::IAM::Role @{AssumeRolePolicyDocument=@{Version='2012-10-17';Statement=@(@{Effect='Allow';Principal=@{Service='ec2.amazonaws.com'};Action='sts:AssumeRole'})};ManagedPolicyArns=@('arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore','arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly');Policies=@(@{PolicyName='ReadBrokerPassword';PolicyDocument=@{Version='2012-10-17';Statement=@(@{Effect='Allow';Action='ssm:GetParameter';Resource=@{'Fn::Sub'='arn:${AWS::Partition}:ssm:${AWS::Region}:${AWS::AccountId}:parameter/campusgo/rabbitmq/password'}})}})} 'SSM management, image pulls and a single runtime password'
Resource InstanceProfile AWS::IAM::InstanceProfile @{Roles=@((Ref InstanceRole))} 'Attach instance permissions'
$bootstrap = (Get-Content "$PSScriptRoot/broker-bootstrap.sh" -Raw) -replace "`r`n","`n"
Resource Broker AWS::EC2::Instance @{
    ImageId=(Ref Ami);InstanceType='t3.small';IamInstanceProfile=(Ref InstanceProfile)
    CreditSpecification=@{CPUCredits='standard'}
    MetadataOptions=@{HttpTokens='required';HttpPutResponseHopLimit=2}
    NetworkInterfaces=@(@{DeviceIndex='0';AssociatePublicIpAddress=$true;SubnetId=(Ref Subnet);GroupSet=@((Ref InternalSecurityGroup),(Ref BrokerSecurityGroup))})
    BlockDeviceMappings=@(@{DeviceName='/dev/xvda';Ebs=@{VolumeSize=16;VolumeType='gp3';Encrypted=$true;DeleteOnTermination=$false}})
    UserData=@{'Fn::Base64'=$bootstrap};Tags=@(@{Key='Name';Value='campusgo-broker'})
} 'Persistent demo broker; encrypted disk survives stop/start' @('Never replace or terminate without preserving broker data')
$resources.Broker.DeletionPolicy='Retain'
$resources.Broker.UpdateReplacePolicy='Retain'
$template = [ordered]@{
    AWSTemplateFormatVersion='2010-09-09'
    Description='CampusGo demo internal DNS, security groups, and persistent RabbitMQ'
    Metadata=@{AWSToolsMetrics=@{AWSAgentToolkit='aws-cloudformation@3'}}
    Parameters=@{Vpc=@{Type='AWS::EC2::VPC::Id'};Subnet=@{Type='AWS::EC2::Subnet::Id'};Ami=@{Type='AWS::EC2::Image::Id'}}
    Resources=$resources
    Outputs=@{NamespaceId=@{Value=(Ref Namespace)};InternalSecurityGroup=@{Value=(Ref InternalSecurityGroup)};BrokerId=@{Value=(Ref Broker)};BrokerPrivateIp=@{Value=(Attr Broker PrivateIp)}}
}
foreach ($name in @('user','supplier','order','credit','apigateway','frontend')) {
    $template.Outputs["${name}Registry"] = @{Value=(Attr "${name}Discovery" Arn)}
}
$template | ConvertTo-Json -Depth 60 | Set-Content "$PSScriptRoot/infrastructure.json" -Encoding utf8
