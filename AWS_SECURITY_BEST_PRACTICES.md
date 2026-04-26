# AWS Security Best Practices

## 🔐 Managing AWS Credentials Securely

### ❌ NEVER Do This:

1. **NEVER** commit credentials to Git
2. **NEVER** share credentials in chat, email, or screenshots
3. **NEVER** hardcode credentials in source code
4. **NEVER** use root account credentials
5. **NEVER** share access keys between users

### ✅ ALWAYS Do This:

1. **ALWAYS** use `.env` files for local development
2. **ALWAYS** add `.env` to `.gitignore`
3. **ALWAYS** use IAM roles when running on AWS
4. **ALWAYS** rotate credentials every 90 days
5. **ALWAYS** apply principle of least privilege
6. **ALWAYS** enable MFA on IAM users

## 🛡️ Credential Management

### For Local Development

```bash
# backend/.env
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
PORT=3000
NODE_ENV=development
```

**Important**: Never commit this file!

### For Production (Render)

Set environment variables in Render Dashboard:
1. Go to your service
2. Environment → Add Environment Variable
3. Add each variable individually:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION`

### For Production on AWS (Recommended)

Use IAM Roles instead of access keys:

```javascript
// No credentials needed!
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  // Credentials automatically obtained from IAM role
});
```

## 🔄 Rotating Credentials

### When to Rotate:
- Every 90 days (recommended)
- When an employee leaves
- When credentials may be compromised
- After a security incident

### How to Rotate:

1. **Create new access key** in IAM Console
2. **Update `.env`** with new credentials
3. **Test** that application works
4. **Update production** environment variables
5. **Delete old access key** in IAM Console

## 🚨 If Credentials Are Compromised

### Immediate Actions (within 1 hour):

1. **Deactivate** the compromised access key
2. **Review CloudTrail** logs for unauthorized activity
3. **Check AWS billing** for unexpected charges
4. **Generate new** access keys
5. **Update** all environments

### AWS CLI Commands:

```bash
# List access keys
aws iam list-access-keys --user-name YOUR_USERNAME

# Deactivate compromised key
aws iam update-access-key \
  --access-key-id COMPROMISED_KEY \
  --status Inactive \
  --user-name YOUR_USERNAME

# Delete compromised key (after deactivating)
aws iam delete-access-key \
  --access-key-id COMPROMISED_KEY \
  --user-name YOUR_USERNAME

# Create new access key
aws iam create-access-key --user-name YOUR_USERNAME
```

## 🔍 Monitoring and Auditing

### Enable CloudTrail

CloudTrail logs all API calls:

```bash
# Check recent Bedrock API calls
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=InvokeModel \
  --max-results 10
```

### Set Up Cost Alerts

1. Go to AWS Budgets
2. Create a budget
3. Set alerts at thresholds (e.g., $10, $50, $100)
4. Get notified if costs spike

### Enable CloudWatch Alarms

Monitor Bedrock usage:
- Number of API calls
- Token usage
- Error rates

## 📋 IAM Policy Best Practices

### Least Privilege Policy

Only grant Bedrock invoke permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:*:*:foundation-model/anthropic.claude-sonnet-4-5-*"
      ]
    }
  ]
}
```

### Deny Dangerous Actions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Action": [
        "iam:*",
        "organizations:*",
        "account:*"
      ],
      "Resource": "*"
    }
  ]
}
```

## 🔧 Alternative: AWS Secrets Manager

For production, use Secrets Manager:

```javascript
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

async function getBedrockCredentials() {
  const client = new SecretsManagerClient({ region: 'us-east-1' });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: 'bedrock-credentials' })
  );
  return JSON.parse(response.SecretString);
}
```

## 📱 Multi-Factor Authentication (MFA)

Enable MFA on all IAM users:
1. Go to IAM → Users → Security credentials
2. Assign MFA device
3. Use virtual MFA (Google Authenticator, Authy, etc.)

## 📊 Security Checklist

Before deploying to production:

- [ ] `.env` file in `.gitignore`
- [ ] No credentials in source code
- [ ] IAM user has least-privilege policy
- [ ] MFA enabled on IAM account
- [ ] CloudTrail enabled
- [ ] Cost alerts configured
- [ ] Credentials rotation schedule set
- [ ] Backup access key stored securely
- [ ] Team trained on security practices

## 🆘 Incident Response Plan

If you suspect a security breach:

1. **Immediately** deactivate all access keys
2. **Review** CloudTrail logs (last 90 days)
3. **Check** AWS billing for unexpected charges
4. **Scan** all EC2 instances for malware
5. **Review** all S3 bucket permissions
6. **Contact** AWS Support if needed
7. **Document** everything for post-mortem
8. **Rotate** all credentials
9. **Update** security policies

## 📚 Additional Resources

- [AWS Security Best Practices](https://aws.amazon.com/security/best-practices/)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/)
- [CloudTrail Documentation](https://docs.aws.amazon.com/cloudtrail/)
- [AWS Well-Architected Framework - Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/)

## 💡 Pro Tips

1. **Use temporary credentials** when possible (STS AssumeRole)
2. **Implement credential scanning** in your CI/CD pipeline
3. **Use AWS Organizations** for multi-account management
4. **Enable AWS Config** for compliance monitoring
5. **Review Security Hub** findings regularly
6. **Subscribe to AWS Security Bulletins**
7. **Use AWS Systems Manager Parameter Store** for non-sensitive configuration
8. **Implement AWS WAF** for application protection

---

**Remember**: Security is a continuous process, not a one-time setup. Regular reviews and updates are essential.
