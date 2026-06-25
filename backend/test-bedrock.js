require('dotenv').config();

const bedrockService = require('./services/bedrockService');

async function testBedrock() {
  const health = bedrockService.getHealthStatus();

  console.log('Testing AWS Bedrock connection...\n');
  console.log('Configuration:');
  console.log(`   Region: ${health.region}`);
  console.log(`   Model ID: ${health.modelId}`);
  console.log(`   Configured: ${health.configured ? 'yes' : 'no'}\n`);

  if (!health.configured) {
    console.error('Bedrock is not fully configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.');
    process.exit(1);
  }

  try {
    const result = await bedrockService.testConnection();
    console.log('Connection test result:', JSON.stringify(result, null, 2));
    console.log('\nBedrock test completed successfully.');
  } catch (error) {
    console.error('Bedrock test failed:');
    console.error(`   Message: ${error.message}`);
    console.error(`   Name: ${error.name || 'Error'}`);
    if (error.statusCode) {
      console.error(`   HTTP Status: ${error.statusCode}`);
    }
    if (error.requestId) {
      console.error(`   Request ID: ${error.requestId}`);
    }

    console.error('\nCommon causes:');
    console.error('   1. Invalid or expired AWS credentials');
    console.error('   2. Wrong AWS region for the enabled Bedrock model');
    console.error('   3. Missing Bedrock invoke permissions on the IAM identity');
    process.exit(1);
  }
}

testBedrock();
