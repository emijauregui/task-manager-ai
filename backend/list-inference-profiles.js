require('dotenv').config();
const { BedrockClient, ListInferenceProfilesCommand } = require('@aws-sdk/client-bedrock');

async function listProfiles() {
  console.log('📋 Listing available Inference Profiles...\n');

  const client = new BedrockClient({
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    const command = new ListInferenceProfilesCommand({});
    const response = await client.send(command);

    console.log(`✅ Found ${response.inferenceProfileSummaries.length} inference profiles:\n`);

    response.inferenceProfileSummaries.forEach((profile, index) => {
      console.log(`${index + 1}. ${profile.inferenceProfileName || profile.inferenceProfileId}`);
      console.log(`   ID: ${profile.inferenceProfileId}`);
      console.log(`   ARN: ${profile.inferenceProfileArn}`);
      console.log(`   Type: ${profile.type}`);
      if (profile.models && profile.models.length > 0) {
        console.log(`   Models: ${profile.models.map(m => m.modelArn).join(', ')}`);
      }
      console.log('');
    });

    // Find Claude Sonnet 4.5 specifically
    const sonnet45 = response.inferenceProfileSummaries.find(p =>
      p.inferenceProfileId.includes('claude-sonnet-4-5') ||
      p.inferenceProfileArn.includes('claude-sonnet-4-5')
    );

    if (sonnet45) {
      console.log('✅ Found Claude Sonnet 4.5 profile:');
      console.log(`   Use this ID: ${sonnet45.inferenceProfileId}`);
      console.log(`   Or ARN: ${sonnet45.inferenceProfileArn}`);
    }
  } catch (error) {
    console.error('❌ Error listing inference profiles:', error.message);
    console.error('   Code:', error.code || error.name);
  }
}

listProfiles();
