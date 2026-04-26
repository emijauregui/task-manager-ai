require('dotenv').config();
const { BedrockClient, ListFoundationModelsCommand } = require('@aws-sdk/client-bedrock');

async function listModels() {
  console.log('📋 Listing available Bedrock models...\n');

  const client = new BedrockClient({
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  try {
    const command = new ListFoundationModelsCommand({
      byProvider: 'Anthropic'
    });

    const response = await client.send(command);

    console.log(`✅ Found ${response.modelSummaries.length} Anthropic models:\n`);

    response.modelSummaries.forEach((model, index) => {
      console.log(`${index + 1}. ${model.modelId}`);
      console.log(`   Name: ${model.modelName}`);
      console.log(`   Provider: ${model.providerName}`);
      if (model.inferenceTypesSupported) {
        console.log(`   Inference: ${model.inferenceTypesSupported.join(', ')}`);
      }
      console.log('');
    });

    console.log('💡 Tip: Use one of these model IDs in your server.js');
  } catch (error) {
    console.error('❌ Error listing models:', error.message);
    console.error('   Code:', error.code || error.name);
  }
}

listModels();
